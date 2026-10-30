// Tiny JSON-file store. Rooms and the recent messages of every room live in one
// file inside the chat data volume, so a restart does not lose the conversation.
const fs = require('node:fs')
const path = require('node:path')

const DATA_DIR = process.env.CHAT_DATA_DIR || path.join(__dirname, 'data')
const DATA_FILE = path.join(DATA_DIR, 'store.json')
const MAX_MESSAGES_PER_ROOM = 500
const MESSAGES_IN_HISTORY = 200

const state = { rooms: [], messages: [] }

function load() {
  try {
    const parsed = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'))
    state.rooms = Array.isArray(parsed.rooms) ? parsed.rooms : []
    state.messages = Array.isArray(parsed.messages) ? parsed.messages : []
  } catch (error) {
    if (error.code !== 'ENOENT') console.error('chat store: could not read', error.message)
  }
}

function persist() {
  try {
    fs.mkdirSync(DATA_DIR, { recursive: true })
    const tmp = `${DATA_FILE}.tmp`
    fs.writeFileSync(tmp, JSON.stringify(state))
    fs.renameSync(tmp, DATA_FILE)
  } catch (error) {
    console.error('chat store: could not write', error.message)
  }
}

load()

module.exports = {
  findRoom(id) {
    const key = String(id || '').trim().toUpperCase()
    return state.rooms.find((room) => room.id === key) || null
  },

  addRoom(room) {
    state.rooms.push(room)
    persist()
  },

  messagesFor(roomId) {
    return state.messages.filter((message) => message.roomId === roomId).slice(-MESSAGES_IN_HISTORY)
  },

  addMessage(message) {
    state.messages.push(message)
    const roomMessages = state.messages.filter((item) => item.roomId === message.roomId)
    if (roomMessages.length > MAX_MESSAGES_PER_ROOM) {
      const stale = new Set(roomMessages.slice(0, roomMessages.length - MAX_MESSAGES_PER_ROOM).map((item) => item.id))
      state.messages = state.messages.filter((item) => !stale.has(item.id))
    }
    persist()
  }
}
