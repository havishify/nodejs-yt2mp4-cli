const { spawn } = require("node:child_process");

(async () => {
  const list = [];

  for (let i = 2; i < process.argv.length; i++) {
    const arg = process.argv[i];
    list.push(arg);
  }

  if (!list.length) {
    console.log('Usage :');
    console.log('ytmp4 <URL>')
    console.log('ytmp4 <URL> <URL> <URL> ...')
    process.exit(1);
  }

  let i = 0;
  for await (const url of list) {
    await new Promise((resolve) => {
      const ls = spawn('yt-dlp', [
        '--no-warnings',
        '-f', 'bestvideo+bestaudio',
        '--merge-output-format', 'mp4',
        url
      ]);

      ls.stderr.on('data', (dat) => console.log(`stderr: ${dat}`));
      ls.stdout.on('data', (dat) => console.log(`stdout: ${dat}`));
      ls.on('close', (code) => {
        console.log(`closed on code ${code}`);
        i++;
        resolve();
      });
    });
  }
})();