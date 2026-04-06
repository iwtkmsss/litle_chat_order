import { useEffect, useEffectEvent, useRef, useState } from 'react';
import { api } from '../api';
import { formatDateTime, formatFileSize } from '../utils';

export function ChatRoom({
  chat,
  emptyTitle,
  onThreadUpdated,
}) {
  const [messages, setMessages] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [body, setBody] = useState('');
  const [files, setFiles] = useState([]);
  const [isSending, setIsSending] = useState(false);
  const [sendError, setSendError] = useState('');
  const fileInputRef = useRef(null);

  const loadMessages = useEffectEvent(async ({ silent = false } = {}) => {
    if (!chat) {
      setMessages([]);
      return;
    }

    if (!silent) {
      setIsLoading(true);
      setError('');
    }

    try {
      const response = await api.listMessages(chat.id);
      setMessages(response.messages);
    } catch (loadError) {
      setError(loadError.message);
    } finally {
      if (!silent) {
        setIsLoading(false);
      }
    }
  });

  useEffect(() => {
    if (!chat) {
      setMessages([]);
      return undefined;
    }

    loadMessages();

    const timer = window.setInterval(() => {
      loadMessages({ silent: true });
    }, 10000);

    return () => {
      window.clearInterval(timer);
    };
  }, [chat?.id]);

  async function handleSubmit(event) {
    event.preventDefault();
    setIsSending(true);
    setSendError('');

    try {
      await api.sendMessage(chat.id, {
        body,
        files,
      });

      setBody('');
      setFiles([]);

      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }

      await loadMessages({ silent: true });
      await onThreadUpdated?.();
    } catch (submitError) {
      setSendError(submitError.message);
    } finally {
      setIsSending(false);
    }
  }

  if (!chat) {
    return (
      <section className="surface-card thread-empty">
        <h2>{emptyTitle}</h2>
      </section>
    );
  }

  return (
    <section className="thread-panel">
      <header className="surface-card thread-header">
        <div>
          <h2>{chat.title}</h2>
          {chat.description ? <p className="muted-copy">{chat.description}</p> : null}
        </div>

        <div className="thread-meta">
          <span>{chat.messageCount} повідомлень</span>
          <span>Оновлено: {formatDateTime(chat.updatedAt)}</span>
        </div>
      </header>

      <div className="surface-card thread-stream">
        {isLoading ? <p className="muted-copy">Завантаження...</p> : null}
        {error ? <p className="form-error">{error}</p> : null}

        {!isLoading && !error && messages.length === 0 ? (
          <div className="thread-placeholder">
            <h3>Порожньо</h3>
          </div>
        ) : null}

        <div className="thread-message-list">
          {messages.map((message) => (
            <article className="message-card" key={message.id}>
              <div className="message-card__head">
                <div>
                  <strong>{message.author.fullName}</strong>
                  <span
                    className={
                      message.author.role === 'manager'
                        ? 'role-badge role-badge--manager'
                        : 'role-badge role-badge--user'
                    }
                  >
                    {message.author.role === 'manager' ? 'Менеджер' : 'Користувач'}
                  </span>
                </div>

                <time>{formatDateTime(message.createdAt)}</time>
              </div>

              {message.body ? <p className="message-body">{message.body}</p> : null}

              {message.attachments.length > 0 ? (
                <div className="attachment-list">
                  {message.attachments.map((attachment) => (
                    <a
                      className="attachment-chip"
                      href={`/api/files/${attachment.id}`}
                      key={attachment.id}
                      rel="noreferrer"
                      target="_blank"
                    >
                      <span>{attachment.originalName}</span>
                      <span>{formatFileSize(attachment.size)}</span>
                    </a>
                  ))}
                </div>
              ) : null}
            </article>
          ))}
        </div>
      </div>

      <form className="surface-card composer-card" onSubmit={handleSubmit}>
        <div className="composer-head">
          <h3>Нове повідомлення</h3>
        </div>

        <label className="field-block">
          <span>Текст повідомлення</span>
          <textarea
            className="field-input field-textarea"
            disabled={isSending}
            onChange={(event) => setBody(event.target.value)}
            rows={5}
            value={body}
          />
        </label>

        <label className="field-block">
          <span>Прикріпити файли</span>
          <input
            className="field-input field-input--file"
            disabled={isSending}
            multiple
            onChange={(event) => setFiles(Array.from(event.target.files ?? []))}
            ref={fileInputRef}
            type="file"
          />
        </label>

        {files.length > 0 ? (
          <div className="selected-files">
            {files.map((file) => (
              <span className="selected-file" key={`${file.name}-${file.size}`}>
                {file.name}
              </span>
            ))}
          </div>
        ) : null}

        {sendError ? <p className="form-error">{sendError}</p> : null}

        <div className="composer-actions">
          <button
            className="secondary-button"
            disabled={isSending}
            onClick={() => {
              setBody('');
              setFiles([]);

              if (fileInputRef.current) {
                fileInputRef.current.value = '';
              }
            }}
            type="button"
          >
            Очистити
          </button>

          <button className="primary-button" disabled={isSending} type="submit">
            {isSending ? 'Надсилаємо...' : 'Надіслати в чат'}
          </button>
        </div>
      </form>
    </section>
  );
}
