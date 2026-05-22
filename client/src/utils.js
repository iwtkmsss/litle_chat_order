const dateTimeFormatter = new Intl.DateTimeFormat('uk-UA', {
  day: '2-digit',
  month: 'long',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
});

const dateFormatter = new Intl.DateTimeFormat('uk-UA', {
  day: '2-digit',
  month: 'long',
  year: 'numeric',
});

export function formatDateTime(value) {
  if (!value) {
    return '';
  }

  return dateTimeFormatter.format(new Date(value));
}

export function formatDate(value) {
  if (!value) {
    return '';
  }

  const date = /^\d{4}-\d{2}-\d{2}$/.test(value)
    ? new Date(`${value}T12:00:00`)
    : new Date(value);

  return dateFormatter.format(date);
}

export function formatFileSize(size) {
  if (!Number.isFinite(size) || size < 1024) {
    return `${size || 0} B`;
  }

  if (size < 1024 * 1024) {
    return `${(size / 1024).toFixed(1)} KB`;
  }

  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}

function getUkrainianLocalPhoneDigits(value) {
  const digits = String(value ?? '').replace(/\D/g, '');

  if (!digits) {
    return '';
  }

  if (digits.startsWith('380')) {
    return digits.slice(3, 12);
  }

  if (digits.startsWith('38')) {
    return digits.slice(2, 11);
  }

  if (digits.startsWith('0')) {
    return digits.slice(1, 10);
  }

  return digits.slice(0, 9);
}

export const UKRAINIAN_PHONE_PREFIX = '+38';

export function formatUkrainianPhone(value) {
  const digits = String(value ?? '').replace(/\D/g, '');

  if (!digits) {
    return '';
  }

  if (digits === '3' || digits === '38') {
    return UKRAINIAN_PHONE_PREFIX;
  }

  if (digits === '380') {
    return '+380';
  }

  const localDigits = getUkrainianLocalPhoneDigits(value);

  if (!localDigits) {
    return '';
  }

  const parts = [
    '+380',
    localDigits.slice(0, 2),
    localDigits.slice(2, 5),
    localDigits.slice(5, 7),
    localDigits.slice(7, 9),
  ].filter(Boolean);

  return parts.join(' ');
}

export function normalizeUkrainianPhone(value) {
  const localDigits = getUkrainianLocalPhoneDigits(value);

  return localDigits.length === 9 ? `+380${localDigits}` : '';
}

export function validateUkrainianPhone(value) {
  return getUkrainianLocalPhoneDigits(value).length === 9;
}
