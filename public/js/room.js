let messagesContainer = document.getElementById('messages');
messagesContainer.scrollTop = messagesContainer.scrollHeight;

const chat_input = document.getElementById('chat_text');

chat_input.addEventListener('keypress', (e) => {
  const key = e.which || e.keyCode;
  if (key !== 13) return;
  const payload = {
    message: chat_input.value,
  }
  console.log(`Message: ${chat_input.value}`);
  myApp.emit('user_message', payload);
  myApp.addMessage(payload)
  chat_input.value = '';
});