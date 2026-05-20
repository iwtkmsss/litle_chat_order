export const APPLICATION_STATUSES = [
  'submitted',
  'accepted',
  'needs_clarification',
  'under_review',
  'technical_conditions_ready',
  'agreement_ready',
  'completed',
  'rejected',
  'draft',
  'in_progress',
];

export const APPLICATION_STATUS_LABELS = {
  submitted: 'Подано',
  accepted: 'Прийнято в обробку',
  needs_clarification: 'Потребує уточнення',
  under_review: 'На технічному розгляді',
  technical_conditions_ready: 'Технічні умови підготовлено',
  agreement_ready: 'Договір підготовлено',
  completed: 'Завершено',
  rejected: 'Відмовлено / повернуто',
  draft: 'Чернетка',
  in_progress: 'Прийнято в обробку',
};

export const APPLICATION_STATUS_TRANSITIONS = {
  submitted: ['accepted', 'needs_clarification', 'rejected'],
  accepted: ['needs_clarification', 'under_review', 'rejected'],
  needs_clarification: ['submitted', 'accepted', 'under_review', 'rejected'],
  under_review: ['needs_clarification', 'technical_conditions_ready', 'rejected'],
  technical_conditions_ready: ['agreement_ready', 'needs_clarification', 'rejected'],
  agreement_ready: ['completed', 'needs_clarification', 'rejected'],
  completed: [],
  rejected: [],
  draft: ['submitted', 'accepted', 'rejected'],
  in_progress: ['accepted', 'needs_clarification', 'under_review', 'completed', 'rejected'],
};

export function isValidApplicationStatus(status) {
  return APPLICATION_STATUSES.includes(status);
}

export function getAllowedApplicationStatusTransitions(status) {
  return APPLICATION_STATUS_TRANSITIONS[status] ?? [];
}

export function doesApplicationStatusRequireComment(status) {
  return status === 'needs_clarification';
}

export function isCustomerVisibleStatusComment(status) {
  return ['needs_clarification', 'rejected'].includes(status);
}

export function assertApplicationStatusTransition({
  actorRole,
  comment = '',
  fromStatus,
  toStatus,
}) {
  if (!isValidApplicationStatus(toStatus)) {
    throw new Error('Некоректний статус заяви.');
  }

  if (fromStatus === toStatus) {
    return { isOverride: false };
  }

  if (doesApplicationStatusRequireComment(toStatus) && !String(comment).trim()) {
    throw new Error('Для статусу "Потребує уточнення" потрібно вказати коментар для замовника.');
  }

  const allowedStatuses = getAllowedApplicationStatusTransitions(fromStatus);

  if (allowedStatuses.includes(toStatus)) {
    return { isOverride: false };
  }

  if (actorRole === 'admin') {
    return { isOverride: true };
  }

  const fromLabel = APPLICATION_STATUS_LABELS[fromStatus] ?? fromStatus;
  const toLabel = APPLICATION_STATUS_LABELS[toStatus] ?? toStatus;
  throw new Error(`Перехід зі статусу "${fromLabel}" у "${toLabel}" не дозволений.`);
}
