# Chatbot Screen (DEEP SPEC)

## Entities
Chatbot:
- id
- name
- tone
- mode

Conversation:
- id
- chatbot_id
- messages[]

Message:
- id
- role (user/ai)
- content
- status (sending/sent/error)

---

## UI STATES

1. No chatbot
- Show empty state
- CTA: Create chatbot

2. Chatbot list
- Sidebar list
- Active chatbot highlighted

3. Editing
- Form editable
- Save disabled until changes

4. Chat active
- Messages list
- Input enabled

---

## CHAT INTERACTION

### Send message
1. User types
2. Press send
3. Disable input
4. Add message (status: sending)
5. Call API POST /chat
6. On success:
   - update message → sent
   - append AI reply
7. On error:
   - show retry button
   - message status = error

---

## EDGE CASES

- Prevent empty message
- Prevent double send
- Timeout after 10s
- Network lost → retry

---

## AUTO BEHAVIOR

- Auto scroll bottom
- Show typing indicator
- Persist conversation

---

## API

POST /chat
{
  chatbot_id,
  conversation_id,
  message
}
