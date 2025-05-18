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

function run(cmd, args) {
  console.log('\n', cmd, args.join(' '), '\n');
  return new Promise((res, rej) => {
    const ls = spawn(cmd, args, { stdio: 'inherit' });
    ls.on('error', rej);
    ls.on('close', (code) => !code ? res() : rej(new Error(`${cmd} exited ${code}`)));
  });
}

async function getSingleVideo(args) {
  const outputFile = `${safeName(args[0].title || Date.now().toString())}.mp4`;

  const ls = [];
  
  for await (const { url, start, end } of args) {
    const hasCut = Number.isFinite(start) && Number.isFinite(end);
    const tmpFile  = path.join(tmpdir(), `${crypto.randomUUID()}.mp4`);
    const outFile  = path.join(tmpdir(), `${crypto.randomUUID()}.mp4`);

    await run('yt-dlp', [
      '--no-warnings',
      '-f', 'bestvideo+bestaudio',
      '--merge-output-format', 'mp4',
      url,
      '-o', hasCut ? tmpFile : outFile
    ]);

    if (hasCut) {
      const dur = end - start;
      await run('ffmpeg', [
        '-hwaccel', 'cuda',
        '-hwaccel_output_format', 'cuda',
        '-ss', `${start}`,
        '-i', tmpFile,
        '-filter_complex', `[0:v]trim=0:end=${dur},setpts=PTS-STARTPTS[v];[0:a]atrim=start=0:end=${dur},asetpts=PTS-STARTPTS[a]`,
        '-map', '[v]', '-map', '[a]',
        '-c:v', 'h264_nvenc',
        '-preset', 'p7',
        '-cq', '23',
        '-c:a', 'aac',
        '-b:a', '192k',
        outFile
      ]);
      await unlink(tmpFile);
    }

    ls.push(outFile);
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

  console.log(`✔ ${outputFile} done`);
}

async function getVideo(title, url, start, end) {
  const hasCut = Number.isFinite(start) && Number.isFinite(end);
  const safeTitle = safeName(title);
  const tmpFile  = path.join(tmpdir(), crypto.randomUUID() + '.mp4');
  const outFile  = `${safeTitle}.mp4`;

  await run('yt-dlp', [
    '--no-warnings',
    '-f', 'bestvideo+bestaudio',
    '--merge-output-format', 'mp4',
    url,
    '-o', hasCut ? tmpFile : outFile,
  ]);

  if (hasCut) {
    const dur = end - start;
    await run('ffmpeg', [
      '-hwaccel', 'cuda',
      '-hwaccel_output_format', 'cuda',
      '-ss', `${start}`,
      '-i', tmpFile,
      '-filter_complex', `[0:v]trim=0:end=${dur},setpts=PTS-STARTPTS[v];[0:a]atrim=start=0:end=${dur},asetpts=PTS-STARTPTS[a]`,
      '-map', '[v]', '-map', '[a]',
      '-c:v', 'h264_nvenc',
      '-preset', 'p7',
      '-cq', '23',
      '-c:a', 'aac',
      '-b:a', '192k',
      outFile
    ]);
    await unlink(tmpFile);
  }

  console.log(`✔ ${outFile} done`);
}

(async () => {
  const options = [ '-one' ];
  const goCombine = process.argv.slice(2).filter((v) => v.includes(options)).length !== 0;
  const args = process.argv.slice(2).filter((v) => !v.includes(options)).map((v) => {
    try { return JSON.parse(v); }
    catch { return { title: undefined, url: v, start: undefined, end: undefined }; }
  });

  if (!args.length) {
    console.log(`Usage:
yt2mp4 <ARG> [<ARG> ...]

<ARG> = URL | "{\"title\":\"<FileName>\",\"url\":\"<URL>\",\"start\":<SEC>,\"end\":<SEC>}"`);
    process.exit(1);
  }

  if (goCombine && args.length > 1) {
    await getSingleVideo(args);
  } else {
    for await (const { title, url, start, end } of args) {
      await getVideo(title, url, start, end);
    }
  }

  console.log('\nPress "Enter" to quit.');
  rl.on('line', () => {
    rl.close();
    process.exit(0);
  });
})();