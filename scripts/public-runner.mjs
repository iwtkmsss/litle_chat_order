import { spawn } from 'node:child_process';
import os from 'node:os';

const mode = process.argv[2] ?? 'preview';
const clientPort = Number(process.env.CLIENT_PORT || process.env.PUBLIC_CLIENT_PORT) || 5173;
const serverPort = Number(process.env.PORT || process.env.SERVER_PORT || process.env.PUBLIC_SERVER_PORT) || 3001;

function detectIpv4() {
  for (const addresses of Object.values(os.networkInterfaces())) {
    for (const address of addresses ?? []) {
      if (address.family === 'IPv4' && !address.internal && !address.address.startsWith('169.254.')) {
        return address.address;
      }
    }
  }

  return '127.0.0.1';
}

const publicHost = process.env.PUBLIC_HOST || detectIpv4();
const clientUrl = `http://${publicHost}:${clientPort}`;
const apiUrl = `http://${publicHost}:${serverPort}`;
const clientOrigin = [
  clientUrl,
  `http://localhost:${clientPort}`,
  `http://127.0.0.1:${clientPort}`,
].join(',');

const publicEnv = {
  ...process.env,
  HOST: '0.0.0.0',
  PORT: String(serverPort),
  VITE_API_URL: apiUrl,
  API_TARGET: apiUrl,
  CLIENT_URL: clientUrl,
  CLIENT_ORIGIN: clientOrigin,
};

function printUrls() {
  console.log(`Public URL: ${clientUrl}`);
  console.log(`API URL: ${apiUrl}`);
  console.log('Tip: set PUBLIC_HOST manually if another IPv4 is needed.');
}

function run(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const isWindows = process.platform === 'win32';
    const executable = isWindows ? commandLine(command, args) : command;
    const child = spawn(executable, isWindows ? [] : args, {
      env: publicEnv,
      stdio: 'inherit',
      shell: isWindows,
      ...options,
    });

    child.on('exit', (code) => {
      if (code === 0) {
        resolve();
        return;
      }

      reject(new Error(`${command} ${args.join(' ')} exited with code ${code}`));
    });
  });
}

function spawnLongRunning(command, args) {
  const isWindows = process.platform === 'win32';
  const executable = isWindows ? commandLine(command, args) : command;
  const child = spawn(executable, isWindows ? [] : args, {
    env: publicEnv,
    stdio: 'inherit',
    shell: isWindows,
  });

  child.on('exit', (code) => {
    process.exit(code ?? 0);
  });
}

function quoteArg(value) {
  const text = String(value);
  return /[\s"]/u.test(text) ? `"${text.replace(/"/g, '\\"')}"` : text;
}

function commandLine(command, args) {
  return [command, ...args.map(quoteArg)].join(' ');
}

printUrls();

if (mode === 'build') {
  await run('npm', ['run', 'build', '-w', 'client']);
} else if (mode === 'dev') {
  spawnLongRunning('npx', [
    'concurrently',
    '-n',
    'server,client',
    '-c',
    'cyan,magenta',
    `npm run dev:public -w server`,
    `npm run dev:public -w client -- --port ${clientPort}`,
  ]);
} else if (mode === 'preview') {
  await run('npm', ['run', 'build', '-w', 'client']);
  spawnLongRunning('npx', [
    'concurrently',
    '-n',
    'server,client',
    '-c',
    'cyan,magenta',
    `npm run start:public -w server`,
    `npm run preview:public -w client -- --port ${clientPort}`,
  ]);
} else {
  console.error(`Unknown public runner mode: ${mode}`);
  process.exit(1);
}
