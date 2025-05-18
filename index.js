const { spawn } = require("node:child_process");
const { unlink, writeFile } = require("node:fs/promises");
const { tmpdir } = require("node:os");
const path = require("node:path");
const crypto = require("node:crypto");
const readline = require("node:readline");

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

function safeName(str = Date.now().toString()) {
  return str.replace(/[\\/:*?"<>|]/g, '_').trim() || 'video';
}

async function run(cmd, args) {
  console.log('\n', cmd, args.join(' '), '\n');
  return new Promise((res, rej) => {
    const ls = spawn(cmd, args, { stdio: 'inherit' });
    ls.on('error', rej);
    ls.on('close', (code) => code === 0 ? res() : rej(new Error(`${cmd} exited ${code}`)));
  });
}

async function download(url, output) {
  return new Promise((res) => {
    run('yt-dlp', [
      '--no-warnings',
      '-f', 'bestvideo[height<=1080]+bestaudio/best[height<=1080]',
      '--merge-output-format', 'mp4',
      '--remux-video', 'mp4',
      '--recode-video', 'mp4',
      url,
      '-o', output
    ]).then(res);
  });
}

async function cut(tmp, start, end, output) {
  const dur = end - start;

  await run('ffmpeg', [
    '-hwaccel', 'cuda',
    '-hwaccel_output_format', 'cuda',
    '-ss', `${start}`,
    '-i', tmp,
    '-filter_complex', `[0:v]trim=0:end=${dur},setpts=PTS-STARTPTS[v];[0:a]atrim=start=0:end=${dur},asetpts=PTS-STARTPTS[a]`,
    '-map', '[v]', '-map', '[a]',
    '-c:v', 'h264_nvenc',
    '-preset', 'p7',
    '-cq', '23',
    '-c:a', 'aac',
    '-b:a', '192k',
    output
  ]);

  await unlink(tmp);
}

async function dlandcut(url, input, output, start = -1, end = -1) {
  const hasCut = end === -1;
  await download(url, hasCut ? input : output);
  if (hasCut) await cut(input, start, end, output);
}

(async () => {
  const options = [ '-one' ];
  const goCombine = process.argv.slice(2).filter((v) => options.includes(v)).length !== 0;
  const args = process.argv.slice(2).filter((v) => !options.includes(v)).map((v) => {
    try { return JSON.parse(v); }
    catch { return { title: '', url: v, start: -1, end: -1 }; }
  });

  if (!args.length) {
    console.log(`Usage:
yt2mp4 <ARG> [<ARG> ...]
  - <ARG> = URL | "{\"title\":\"<FileName>\",\"url\":\"<URL>\",\"start\":<SEC>,\"end\":<SEC>}"`);
    process.exit(1);
  }

  if (goCombine && args.length > 1) {
    const outputFile = `${safeName(args[0].title || Date.now().toString())}.mp4`;
    const ls = [];
    
    for await (const { url, start, end } of args) {
      const output = path.join(tmpdir(), `${crypto.randomUUID()}.mp4`);
      await dlandcut(url, path.join(tmpdir(), `${crypto.randomUUID()}.mp4`), output, start, end);
      ls.push(output);
    }

    const listfile = path.join(tmpdir(), `${crypto.randomUUID()}.txt`);
    await writeFile(listfile, ls.map((v) => `file '${v}'`).join('\n'));

    await run('ffmpeg', [
      '-f', 'concat', '-safe', '0',
      '-i', listfile,
      '-c', 'copy',
      outputFile
    ]);

    await unlink(listfile);
    for await (const tmp of ls) {
      await unlink(tmp);
    }
  } else {
    for await (const task of args) {
      const { title, url, start, end } = task;
      await dlandcut(url, path.join(tmpdir(), crypto.randomUUID() + '.mp4'), `${safeName(title)}.mp4`, start, end);
    }
  }

  console.log('\nPress "Enter" to quit.');
  rl.on('line', () => {
    rl.close();
    process.exit(0);
  });
})();