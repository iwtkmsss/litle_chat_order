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
  submitted: ['accepted', 'needs_clarification'],
  accepted: ['needs_clarification', 'completed'],
  needs_clarification: ['accepted'],
  under_review: ['needs_clarification', 'completed'],
  technical_conditions_ready: ['needs_clarification', 'completed'],
  agreement_ready: ['needs_clarification', 'completed'],
  completed: ['accepted'],
  rejected: ['accepted'],
  draft: ['submitted', 'accepted'],
  in_progress: ['accepted', 'needs_clarification', 'completed'],
};

export function isValidApplicationStatus(status) {
  return APPLICATION_STATUSES.includes(status);
}

export function getAllowedApplicationStatusTransitions(status) {
  return APPLICATION_STATUS_TRANSITIONS[status] ?? [];
}

export function doesApplicationStatusRequireComment(status) {
  return ['needs_clarification', 'rejected'].includes(status);
}

export function isCustomerVisibleStatusComment(status) {
  return ['needs_clarification', 'rejected'].includes(status);
}

export function isClosedApplicationStatus(status) {
  return ['completed', 'rejected'].includes(status);
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
    const label = APPLICATION_STATUS_LABELS[toStatus] ?? toStatus;
    throw new Error(`Для статусу "${label}" потрібно вказати коментар для замовника.`);
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
