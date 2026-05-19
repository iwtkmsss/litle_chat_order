import { ChatRoom } from '../ChatRoom';

export function ApplicationChatPanel({ onThreadUpdated, selectedApplication }) {
  return (
    <section className="application-detail-grid__wide">
      <ChatRoom
        chat={selectedApplication.chat}
        emptyTitle="Немає заяви"
        onThreadUpdated={onThreadUpdated}
      />
    </section>
  );
}
