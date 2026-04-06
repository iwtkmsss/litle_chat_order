import 'dotenv/config';
import readline from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';
import { createUser, hasManager } from './database.js';
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
  if (hasManager()) {
    console.error('Акаунт менеджера вже існує. Цю команду можна використати лише один раз.');
    process.exit(1);
  }

  const providedName = readArgument('--name');
  const providedPassword = readArgument('--password');
  const interfaceHandle = readline.createInterface({ input, output });

  try {
    const fullName = validateFullName(
      providedName ?? (await interfaceHandle.question("Ім'я та прізвище менеджера: ")),
    );
    const password = validatePassword(
      providedPassword ?? (await interfaceHandle.question('Пароль менеджера: ')),
    );
    const passwordHash = await hashPassword(password);
    const manager = createUser({
      fullName,
      passwordHash,
      role: 'manager',
    });

    console.log(`Менеджера створено: ${manager.full_name}`);
  } catch (error) {
    console.error(error.message);
    process.exit(1);
  } finally {
    interfaceHandle.close();
  }
}

await main();
