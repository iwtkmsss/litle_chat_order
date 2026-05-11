import 'dotenv/config';
import readline from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';
import { createUser, hasAdmin } from './database.js';
import {
  hashPassword,
  validateFullName,
  validatePassword,
} from './auth.js';

function readArgument(flag) {
  const index = process.argv.indexOf(flag);

  if (index === -1) {
    return null;
  }

  return process.argv[index + 1] ?? null;
}

async function main() {
  if (hasAdmin()) {
    console.error('Акаунт адміністратора вже існує. Цю команду можна використати лише один раз.');
    process.exit(1);
  }

  const providedName = readArgument('--name');
  const providedPassword = readArgument('--password');
  const interfaceHandle = readline.createInterface({ input, output });

  try {
    const fullName = validateFullName(
      providedName ?? (await interfaceHandle.question("ПІБ адміністратора: ")),
    );
    const password = validatePassword(
      providedPassword ?? (await interfaceHandle.question('Пароль адміністратора: ')),
    );
    const passwordHash = await hashPassword(password);
    const admin = createUser({
      fullName,
      passwordHash,
      role: 'admin',
    });

    console.log(`Адміністратора створено: ${admin.fullName}`);
  } catch (error) {
    console.error(error.message);
    process.exit(1);
  } finally {
    interfaceHandle.close();
  }
}

await main();
