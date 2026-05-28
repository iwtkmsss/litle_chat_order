class ApiError extends Error {
  constructor(message, status, payload) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.payload = payload;
  }
}

async function parseResponse(response) {
  const contentType = response.headers.get('content-type') ?? '';

  if (response.status === 204) {
    return null;
  }

  if (contentType.includes('application/json')) {
    return response.json();
  }

  return null;
}

const apiBaseUrl = String(import.meta.env.VITE_API_URL ?? '').replace(/\/$/, '');

export function apiUrl(path) {
  if (/^https?:\/\//i.test(path)) {
    return path;
  }

  return `${apiBaseUrl}${path}`;
}

async function request(path, options = {}) {
  const isFormData = options.body instanceof FormData;
  const response = await fetch(apiUrl(path), {
    ...options,
    credentials: 'include',
    headers: {
      ...(isFormData ? {} : { 'Content-Type': 'application/json' }),
      ...(options.headers ?? {}),
    },
  });
  const payload = await parseResponse(response);

  if (!response.ok) {
    throw new ApiError(
      payload?.error ?? 'Не вдалося виконати запит.',
      response.status,
      payload,
    );
  }

  return payload;
}

export const api = {
  getCurrentUser() {
    return request('/api/auth/me');
  },

  login(credentials) {
    return request('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify(credentials),
    });
  },

  logout() {
    return request('/api/auth/logout', {
      method: 'POST',
    });
  },

  listPublicStations() {
    return request('/api/public/stations');
  },

  registerCustomerApplication(input) {
    return request('/api/public/register', {
      method: 'POST',
      body: JSON.stringify(input),
    });
  },

  listUsers() {
    return request('/api/users');
  },

  createUser(input) {
    return request('/api/users', {
      method: 'POST',
      body: JSON.stringify(input),
    });
  },

  updateUser(userId, input) {
    return request(`/api/users/${userId}`, {
      method: 'PUT',
      body: JSON.stringify(input),
    });
  },

  deleteUser(userId) {
    return request(`/api/users/${userId}`, {
      method: 'DELETE',
    });
  },

  listStations() {
    return request('/api/stations');
  },

  createStation(input) {
    return request('/api/stations', {
      method: 'POST',
      body: JSON.stringify(input),
    });
  },

  updateStation(stationId, input) {
    return request(`/api/stations/${stationId}`, {
      method: 'PUT',
      body: JSON.stringify(input),
    });
  },

  listSettings() {
    return request('/api/settings');
  },

  updateSetting(key, input) {
    return request(`/api/settings/${encodeURIComponent(key)}`, {
      method: 'PUT',
      body: JSON.stringify(input),
    });
  },

  listDeadlineRules() {
    return request('/api/deadline-rules');
  },

  updateDeadlineRule(key, input) {
    return request(`/api/deadline-rules/${encodeURIComponent(key)}`, {
      method: 'PUT',
      body: JSON.stringify(input),
    });
  },

  listStageTemplates() {
    return request('/api/stage-templates');
  },

  updateStageTemplate(templateId, input) {
    return request(`/api/stage-templates/${templateId}`, {
      method: 'PUT',
      body: JSON.stringify(input),
    });
  },

  listAuditLog(limit = 100) {
    return request(`/api/audit-log?limit=${limit}`);
  },

  lookupApplication(input) {
    return request('/api/public/applications/lookup', {
      method: 'POST',
      body: JSON.stringify(input),
    });
  },

  activatePendingApplicationAccess(token) {
    return request(`/api/public/application-access/${encodeURIComponent(token)}`, {
      method: 'POST',
    });
  },

  getPendingApplication() {
    return request('/api/pending/application');
  },

  updatePendingApplication(input) {
    return request('/api/pending/application', {
      method: 'PUT',
      body: JSON.stringify(input),
    });
  },

  listApplications() {
    return request('/api/applications');
  },

  getApplication(applicationId) {
    return request(`/api/applications/${applicationId}`);
  },

  createApplication(input) {
    return request('/api/applications', {
      method: 'POST',
      body: JSON.stringify(input),
    });
  },

  createCustomerApplication(input) {
    return request('/api/customer/applications', {
      method: 'POST',
      body: JSON.stringify(input),
    });
  },

  updateApplication(applicationId, input) {
    return request(`/api/applications/${applicationId}`, {
      method: 'PUT',
      body: JSON.stringify(input),
    });
  },

  revealCustomerAccess(applicationId) {
    return request(`/api/applications/${applicationId}/customer-access/reveal`, {
      method: 'POST',
    });
  },

  deleteApplication(applicationId) {
    return request(`/api/applications/${applicationId}`, {
      method: 'DELETE',
    });
  },

  updateApplicationStage(applicationId, stageId, input) {
    return request(`/api/applications/${applicationId}/stages/${stageId}`, {
      method: 'PUT',
      body: JSON.stringify(input),
    });
  },

  generateApplicationDocument(applicationId, documentType) {
    return request(`/api/applications/${applicationId}/documents`, {
      method: 'POST',
      body: JSON.stringify({ documentType }),
    });
  },

  listChats() {
    return request('/api/chats');
  },

  createChat(input) {
    return request('/api/chats', {
      method: 'POST',
      body: JSON.stringify(input),
    });
  },

  deleteChat(chatId) {
    return request(`/api/chats/${chatId}`, {
      method: 'DELETE',
    });
  },

  updateChatAccess(chatId, userIds) {
    return request(`/api/chats/${chatId}/access`, {
      method: 'PUT',
      body: JSON.stringify({ userIds }),
    });
  },

  listMessages(chatId) {
    return request(`/api/chats/${chatId}/messages`);
  },

  sendMessage(chatId, input) {
    const formData = new FormData();
    formData.append('body', input.body ?? '');

    for (const file of input.files ?? []) {
      formData.append('files', file);
    }

    return request(`/api/chats/${chatId}/messages`, {
      method: 'POST',
      body: formData,
    });
  },
};
