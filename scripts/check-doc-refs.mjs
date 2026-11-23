// 문서의 `파일:줄` 참조가 아직 맞는 곳을 가리키는지 본다 — 경고만 하고 실패시키지 않는다
// 사용: node scripts/check-doc-refs.mjs [<기준 커밋>]
//   기준 커밋이 없으면 지금 파일에서 없는 파일 · 범위 밖 · 빈 줄만 본다
//   기준 커밋이 있으면 그 커밋 → 작업 트리 사이에 코드가 바뀌어 줄이 밀렸거나 내용이 바뀐 참조도 알린다
//   (그 사이에 문서도 바뀌었으면 고쳐 쓴 것으로 보고 밀림 검사는 건너뛴다)
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

// 어느 폴더에서 돌려도 이 스크립트가 든 레포를 본다
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const inCi = process.env.GITHUB_ACTIONS === 'true';

// 옛 기록이라 그 당시 코드를 가리키는 폴더 — 검사하지 않는다
const SKIP = ['docs/archive/', 'docs/design/'];
// 코드 파일 확장자만 참조로 본다 — `호스트.net:443` 같은 주소를 파일로 착각하지 않게
const CODE_EXT = /\.(ts|tsx|js|mjs|cjs|json|prisma|sql|ya?ml|conf|sh|ps1|css)$/;

// git 명령을 레포 루트에서 돌려 문자열로 받는다
const git = (...args) =>
  execFileSync('git', ['-C', root, '-c', 'core.quotepath=false', ...args], {
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
  });

// 강제 push 등으로 기준 커밋이 히스토리에 없으면 기준 없이 지금 파일만 본다
function usableBase(rev) {
  if (!rev) return null;
  try {
    git('cat-file', '-e', `${rev}^{commit}`);
    return rev;
  } catch {
    console.log(`기준 커밋 ${rev} 을 찾지 못해 밀림 검사는 건너뛴다`);
    return null;
  }
}
const base = usableBase(process.argv[2]);

const tracked = git('ls-files').split('\n').filter(Boolean);
const docs = tracked.filter((f) => f.endsWith('.md') && !SKIP.some((s) => f.startsWith(s)));
const changed = base ? new Set(git('diff', '--name-only', base, '--').split('\n').filter(Boolean)) : new Set();

// 문서에 적힌 경로(앞부분이 빠질 수 있음)를 레포 안 실제 파일 하나로 찾는다
function resolve(ref) {
  const hits = tracked.filter((t) => t === ref || t.endsWith('/' + ref));
  return hits.length === 1 ? hits[0] : null;
}

const fileCache = new Map();
// 지금 파일의 줄 배열과 기준 커밋 대비 diff 묶음을 읽어 둔다 — 읽지 못하면(인덱스에만 남은 파일 등) null
function load(file) {
  if (fileCache.has(file)) return fileCache.get(file);
  let lines;
  try {
    lines = readFileSync(join(root, file), 'utf8').split(/\r?\n/);
  } catch {
    fileCache.set(file, null);
    return null;
  }
  const hunks = [];
  if (base && changed.has(file)) {
    const diff = git('diff', '-U0', base, '--', file);
    // 기준 커밋에 없던 파일(새로 만들었거나 다른 경로에서 옮겨 옴)은 밀림을 셀 기준이 없다.
    // 맨 앞에 줄을 넣은 것도 hunk 가 -0,0 이라 hunk 대신 /dev/null 로 가린다
    if (!/^--- \/dev\/null$/m.test(diff)) {
      for (const m of diff.matchAll(/^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/gm)) {
        hunks.push({ a: +m[1], b: m[2] === undefined ? 1 : +m[2], c: +m[3], d: m[4] === undefined ? 1 : +m[4] });
      }
    }
  }
  const v = { lines, hunks };
  fileCache.set(file, v);
  return v;
}

// 기준 커밋의 줄 L 이 지금 몇 번째 줄인지 — 바뀐 묶음 안이면 바뀐 것으로 본다
function mapLine(hunks, L) {
  let delta = 0;
  for (const h of hunks) {
    if (h.b > 0 && L >= h.a && L < h.a + h.b) return { modified: true, n: h.c };
    const end = h.b === 0 ? h.a : h.a + h.b - 1;
    if (end < L) delta += h.d - h.b;
  }
  return { modified: false, n: L + delta };
}

let count = 0;
// 경고 한 줄을 남긴다 — CI 에서는 GitHub annotation 형식
function warn(doc, line, msg) {
  count++;
  console.log(inCi ? `::warning file=${doc},line=${line}::${msg}` : `${doc}:${line}  ${msg}`);
}

// 문서 하나의 참조를 모두 검사한다
function checkDoc(doc) {
  const docChanged = changed.has(doc);
  let docLines;
  try {
    docLines = readFileSync(join(root, doc), 'utf8').split(/\r?\n/);
  } catch {
    return; // 인덱스에만 남고 지운 문서
  }
  docLines.forEach((text, i) => {
    // `:줄` 단독 표기는 같은 줄 안의 앞 참조만 잇는다 — 아래 줄의 `:3000` 같은 포트를 파일 줄로 보지 않게
    let lastRef = null;
    for (const m of text.matchAll(/`([^`\n]+)`/g)) {
      let ref;
      let L;
      let mm = m[1].match(/^([\w./()\[\]-]+):(\d+)(?:-\d+)?$/);
      if (mm && CODE_EXT.test(mm[1])) {
        ref = mm[1];
        lastRef = ref;
        L = +mm[2];
      } else if ((mm = m[1].match(/^:(\d+)$/)) && lastRef) {
        ref = lastRef;
        L = +mm[1];
      } else continue;

      const label = `\`${m[1]}\``;
      const file = resolve(ref);
      if (!file) {
        warn(doc, i + 1, `${label} — 파일을 찾지 못함 (없거나 같은 이름이 여럿)`);
        continue;
      }
      const loaded = load(file);
      if (!loaded) {
        warn(doc, i + 1, `${label} — ${file} 을 읽지 못함 (지운 파일?)`);
        continue;
      }
      const { lines, hunks } = loaded;
      if (L < 1) warn(doc, i + 1, `${label} — 줄 번호가 1보다 작음`);
      else if (L > lines.length) warn(doc, i + 1, `${label} — ${file} 은 ${lines.length}줄뿐`);
      else if (!lines[L - 1].trim()) warn(doc, i + 1, `${label} — 빈 줄을 가리킴`);
      if (L < 1) continue;

      if (docChanged || !hunks.length) continue;
      const r = mapLine(hunks, L);
      if (r.modified) warn(doc, i + 1, `${label} — 가리키던 줄이 바뀜 (${file}, 지금 ${r.n}줄 근처)`);
      else if (r.n !== L) warn(doc, i + 1, `${label} — 코드가 바뀌어 지금은 ${r.n}줄 (${file})`);
    }
  });
}

// 경고 전용 검사라 예상 못 한 오류가 나도 실패로 끝내지 않는다
try {
  for (const doc of docs) checkDoc(doc);
  console.log(count ? `문서 줄 참조 경고 ${count}건` : '문서 줄 참조 — 이상 없음');
} catch (e) {
  console.log(inCi ? `::warning::문서 줄 참조 검사가 중간에 멈춤 — ${e.message}` : `검사가 중간에 멈춤 — ${e.message}`);
}
