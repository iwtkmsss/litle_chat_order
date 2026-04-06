import bcrypt from 'bcryptjs';
import crypto from 'node:crypto';

export function normalizeFullName(value) {
  return value.trim().replace(/\s+/g, ' ');
}

export function normalizeLoginKey(value) {
  return normalizeFullName(value).toLowerCase();
}

export function validateFullName(value) {
  const fullName = normalizeFullName(value ?? '');

  if (fullName.length < 3) {
    throw new Error("Ім'я та прізвище мають містити щонайменше 3 символи.");
  }

  if (fullName.length > 120) {
    throw new Error("Ім'я та прізвище мають містити не більше 120 символів.");
  }

  return fullName;
}

export function validatePassword(value) {
  const password = String(value ?? '');

  if (password.length < 6) {
    throw new Error('Пароль має містити щонайменше 6 символів.');
  }

  if (password.length > 120) {
    throw new Error('Пароль має містити не більше 120 символів.');
  }

  return password;
}

export async function hashPassword(password) {
  return bcrypt.hash(password, 10);
}

export async function verifyPassword(password, passwordHash) {
  return bcrypt.compare(password, passwordHash);
}

export function createSessionToken() {
  return crypto.randomBytes(32).toString('hex');
}

export function userToClient(user) {
  return {
    id: user.id,
    fullName: user.full_name,
    role: user.role,
    createdAt: user.created_at,
  };
}
