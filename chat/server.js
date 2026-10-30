const path = require('node:path')
const http = require('node:http')
const crypto = require('node:crypto')
const express = require('express')
const { Server } = require('socket.io')
const store = require('./store')

const PORT = Number(process.env.PORT || 3000)
const MAX_TEXT_LENGTH = 2000
// No 0/O/1/I so an invite code can be read out loud.
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'

const app = express()
app.use(express.json({ limit: '32kb' }))
app.use(express.static(path.join(__dirname, 'public')))

function cleanName(value) {
  return String(value || '').trim().replace(/\s+/g, ' ').slice(0, 24)
}

function cleanText(value) {
  return String(value || '').replace(/\r\n/g, '\n').trim().slice(0, MAX_TEXT_LENGTH)
}

function newRoomCode() {
  let code
  do {
    code = Array.from({ length: 6 }, () => CODE_ALPHABET[crypto.randomInt(CODE_ALPHABET.length)]).join('')
  } while (store.findRoom(code))
  return code
}

app.post('/api/rooms', (req, res) => {
  const name = cleanName(req.body && req.body.name)
  if (!name) return res.status(400).json({ error: 'name-required' })

  const room = { id: newRoomCode(), name: `Чат на ${name}`, createdAt: Date.now() }
  store.addRoom(room)
  res.status(201).json(room)
})

app.get('/api/rooms/:id', (req, res) => {
  const room = store.findRoom(req.params.id)
  if (!room) return res.status(404).json({ error: 'room-not-found' })
  res.json(room)
})

// Invite links point at /r/<code>; the client app reads the code from the path.
app.get(['/r/:id'], (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'))
})

const server = http.createServer(app)
const io = new Server(server, {
  // The preview proxy forwards the public Origin while Host stays the sandbox
  // host, so reflect the origin instead of running the same-origin check.
  cors: { origin: true }
})

function onlineNames(roomId) {
  const names = new Set()
  for (const socket of io.sockets.sockets.values()) {
    if (socket.data.roomId === roomId && socket.data.name) names.add(socket.data.name)
  }
  return [...names].sort((a, b) => a.localeCompare(b, 'bg'))
}

function broadcastPresence(roomId) {
  io.to(roomId).emit('online', onlineNames(roomId))
}

function leaveRoom(socket) {
  const roomId = socket.data.roomId
  if (!roomId) return
  socket.leave(roomId)
  socket.data.roomId = null
  // The socket is still in the collection during `disconnect`, so recount later.
  setTimeout(() => broadcastPresence(roomId), 50).unref()
}

io.on('connection', (socket) => {
  socket.on('join', (payload, ack) => {
    const name = cleanName(payload && payload.name)
    const room = store.findRoom(payload && payload.roomId)
    const reply = typeof ack === 'function' ? ack : () => {}

    if (!room) return reply({ error: 'room-not-found' })
    if (!name) return reply({ error: 'name-required' })

    leaveRoom(socket)
    socket.data.roomId = room.id
    socket.data.name = name
    socket.join(room.id)

    reply({ room, messages: store.messagesFor(room.id), online: onlineNames(room.id) })
    broadcastPresence(room.id)
  })

  socket.on('message', (payload, ack) => {
    const reply = typeof ack === 'function' ? ack : () => {}
    const { roomId, name } = socket.data
    if (!roomId) return reply({ error: 'not-joined' })

    const text = cleanText(payload && payload.text)
    if (!text) return reply({ error: 'empty' })

    const message = { id: crypto.randomUUID(), roomId, author: name, text, at: Date.now() }
    store.addMessage(message)
    io.to(roomId).emit('message', message)
    reply({ ok: true })
  })

  socket.on('disconnect', () => leaveRoom(socket))
})

server.listen(PORT, '0.0.0.0', () => {
  console.log(`chat listening on http://0.0.0.0:${PORT}`)
})
