(function () {
  const $ = (id) => document.getElementById(id)
  const timeFormat = new Intl.DateTimeFormat('bg-BG', { hour: '2-digit', minute: '2-digit' })
  const screens = {
    landing: $('screen-landing'),
    join: $('screen-join'),
    notfound: $('screen-notfound'),
    room: $('screen-room')
  }

  let room = null
  let myName = ''
  let socket = null

  function showScreen(name) {
    Object.keys(screens).forEach((key) => { screens[key].hidden = key !== name })
  }

  function setError(node, message) {
    node.textContent = message || ''
    node.hidden = !message
  }

  function inviteLink(code) {
    return location.origin + '/r/' + code
  }

  function roomCodeFromPath() {
    const match = location.pathname.match(/^\/r\/([A-Za-z0-9]{1,16})\/?$/)
    return match ? match[1].toUpperCase() : null
  }

  function rememberName(name) {
    try { localStorage.setItem('chat.name', name) } catch (error) { /* private mode */ }
  }

  function restoreName() {
    try { return localStorage.getItem('chat.name') || '' } catch (error) { return '' }
  }

  /* ---------- messages ---------- */

  function messageNode(message) {
    const mine = message.author === myName
    const item = document.createElement('li')
    item.className = 'msg' + (mine ? ' mine' : '')

    const bubble = document.createElement('div')
    bubble.className = 'bubble'
    bubble.textContent = message.text

    const meta = document.createElement('div')
    meta.className = 'meta'
    meta.textContent = (mine ? 'Ти' : message.author) + ' · ' + timeFormat.format(new Date(message.at))

    item.append(bubble, meta)
    return item
  }

  function showEmptyState() {
    const list = $('messages')
    list.innerHTML = ''
    const item = document.createElement('li')
    item.className = 'empty'
    item.id = 'messages-empty'
    item.textContent = 'Още няма съобщения. Напиши първото и приятелите ти ще го видят веднага.'
    list.append(item)
  }

  function appendMessage(message) {
    const list = $('messages')
    const empty = $('messages-empty')
    if (empty) empty.remove()
    const node = messageNode(message)
    node.dataset.messageId = message.id
    list.append(node)
    list.scrollTop = list.scrollHeight
  }

  function renderMessages(messages) {
    if (!messages || !messages.length) return showEmptyState()
    const list = $('messages')
    list.innerHTML = ''
    messages.forEach((message) => {
      const node = messageNode(message)
      node.dataset.messageId = message.id
      list.append(node)
    })
    list.scrollTop = list.scrollHeight
  }

  /* ---------- presence ---------- */

  function renderOnline(names) {
    const list = $('online-list')
    list.innerHTML = ''
    names.forEach((name) => {
      const item = document.createElement('li')
      const avatar = document.createElement('span')
      avatar.className = 'avatar'
      avatar.textContent = name.charAt(0).toUpperCase()
      const label = document.createElement('span')
      label.textContent = name === myName ? name + ' (ти)' : name
      item.append(avatar, label)
      list.append(item)
    })
    const count = names.length
    $('room-status').textContent = count === 1
      ? 'Само ти си на линия'
      : count + ' на линия'
    $('status-dot').classList.toggle('off', count === 0)
  }

  /* ---------- socket ---------- */

  function handleJoin(reply) {
    if (!reply || reply.error) {
      $('room-status').textContent = 'Не успяхме да се присъединим'
      $('status-dot').classList.add('off')
      return
    }
    room = reply.room || room
    $('room-name').textContent = room.name
    $('invite-link').value = inviteLink(room.id)
    renderMessages(reply.messages)
    renderOnline(reply.online || [])
  }

  function connect() {
    if (!socket) {
      socket = io({ autoConnect: false })
      socket.on('connect', () => {
        if (room) socket.emit('join', { roomId: room.id, name: myName }, handleJoin)
      })
      socket.on('message', appendMessage)
      socket.on('online', renderOnline)
      socket.on('disconnect', () => {
        $('room-status').textContent = 'Връзката е прекъсната…'
        $('status-dot').classList.add('off')
      })
    }

    if (socket.connected) socket.emit('join', { roomId: room.id, name: myName }, handleJoin)
    else socket.connect()
  }

  /* ---------- entering a room ---------- */

  function openInvitePanel() {
    $('invite-panel').hidden = false
  }

  function enterRoom(name) {
    myName = name
    rememberName(name)
    $('room-name').textContent = room.name
    $('invite-link').value = inviteLink(room.id)
    showEmptyState()
    showScreen('room')
    $('room-status').textContent = 'Свързване…'
    connect()
  }

  function goToRoom(code) {
    history.pushState({}, '', '/r/' + code)
  }

  /* ---------- forms ---------- */

  $('create-form').addEventListener('submit', async (event) => {
    event.preventDefault()
    const error = $('create-error')
    const name = $('create-name').value.trim()
    if (!name) return setError(error, 'Въведи име, за да те видят приятелите.')
    setError(error, null)

    const button = event.target.querySelector('button')
    button.disabled = true
    try {
      const response = await fetch('/api/rooms', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name })
      })
      if (!response.ok) throw new Error('request failed')
      room = await response.json()
      goToRoom(room.id)
      enterRoom(name)
      openInvitePanel()
    } catch (requestError) {
      setError(error, 'Не успяхме да създадем чата. Опитай пак.')
    } finally {
      button.disabled = false
    }
  })

  $('join-form').addEventListener('submit', (event) => {
    event.preventDefault()
    const error = $('join-error')
    const name = $('join-name').value.trim()
    if (!name) return setError(error, 'Въведи име, за да се присъединиш.')
    setError(error, null)
    enterRoom(name)
  })

  $('composer').addEventListener('submit', (event) => {
    event.preventDefault()
    const input = $('message-input')
    const text = input.value.trim()
    if (!text || !socket || !socket.connected) return
    input.value = ''
    socket.emit('message', { text }, (reply) => {
      if (reply && reply.error) input.value = text
    })
  })

  $('invite-btn').addEventListener('click', () => {
    const panel = $('invite-panel')
    panel.hidden = !panel.hidden
    if (!panel.hidden) $('invite-link').select()
  })

  $('copy-btn').addEventListener('click', async () => {
    const input = $('invite-link')
    const button = $('copy-btn')
    try {
      await navigator.clipboard.writeText(input.value)
      button.textContent = 'Копирано'
    } catch (error) {
      input.select()
      button.textContent = 'Копирай'
    }
    setTimeout(() => { button.textContent = 'Копирай' }, 1800)
  })

  /* ---------- boot ---------- */

  async function boot() {
    $('create-name').value = restoreName()
    $('join-name').value = restoreName()

    const code = roomCodeFromPath()
    if (!code) return showScreen('landing')

    try {
      const response = await fetch('/api/rooms/' + code)
      if (!response.ok) return showScreen('notfound')
      room = await response.json()
      $('join-room-name').textContent = room.name
      showScreen('join')
      $('join-name').focus()
    } catch (error) {
      showScreen('notfound')
    }
  }

  boot()
})()
