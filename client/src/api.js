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

async function request(path, options = {}) {
  const isFormData = options.body instanceof FormData;
  const response = await fetch(path, {
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

  listUsers() {
    return request('/api/users');
  },

  createUser(input) {
    return request('/api/users', {
      method: 'POST',
      body: JSON.stringify(input),
    });
  },

  deleteUser(userId) {
    return request(`/api/users/${userId}`, {
      method: 'DELETE',
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
