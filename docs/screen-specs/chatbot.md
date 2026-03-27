# Chatbot Screen

## Entities
Chatbot:
- id, name, tone, mode

Conversation:
- id, chatbot_id, messages

## States
1. No chatbot
2. Chatbot list
3. Editing
4. Test chat

## Flow
Send message → POST /chat → loading → response

## Rules
- Multiple chatbots supported
- Each chatbot has separate conversations
