// @flow
import net from 'net'
import irc from 'slate-irc'
import equalNames from '../modules/equalNames'
import type { Thunk } from '../flow'

export const CONNECTION_CLOSED = 'CONNECTION_CLOSED'

type Creds = {
  realName: string,
  nickname: string,
  server: string,
  port: number,
  password: string
}

export const connectToServer = (credentials: Creds): Thunk => {
  const { realName, nickname, server, port } = credentials

  return dispatch => {
    const id = credentialsToId(credentials)
    const stream = createIrcStream(credentials, dispatch)

    dispatch({
      type: 'REQUEST_CONNECTION_PENDING',
      connection: {
        id,
        isConnected: false,
        isWelcome: false,
        nickname,
        realName,
        server,
        port,
        stream,
        error: null,
        conversations: null
      }
    })

    stream.on('errors', e => {
      console.log('errors', e)
    })

    stream.on('mode', e => {
      console.log('mode', e)
    })

    stream.on('invite', e => {
      console.log('invite', e)
    })

    stream.on('notice', e => {
      const channelInMessage = getChannelFromNotice(e.message)

      var to, message
      if (channelInMessage) {
        let splitMessage = e.message.split(' ')
        splitMessage.shift() // remove leading channel name

        to = channelInMessage
        message = splitMessage.join(' ')
      } else {
        to = e.to
        message = e.message
      }

      dispatch({
        type: 'RECEIVE_NOTICE',
        connectionId: id,
        from: e.from,
        to,
        message
      })
    })

    stream.on('away', e => {
      dispatch({
        type: 'RECEIVE_AWAY',
        connectionId: id,
        nick: e.nick,
        message: e.message
      })
    })

    stream.on('part', e => {
      dispatch({
        type: 'RECEIVE_PART',
        connectionId: id,
        nick: e.nick,
        message: e.message,
        channels: e.channels
      })
    })

    stream.on('quit', e => {
      dispatch({
        type: 'RECEIVE_QUIT',
        connectionId: id,
        nick: e.nick,
        message: e.message
      })
    })

    stream.on('kick', e => {
      console.log('kick', e)
    })

    stream.on('motd', e => {
      dispatch({
        type: 'RECEIVE_MOTD',
        connectionId: id,
        motd: e.motd.join('\n')
      })
    })

    stream.on('welcome', nick => {
      dispatch({
        type: 'RECEIVE_WELCOME',
        connectionId: id,
        nick
      })
    })

    stream.on('nick', e => {
      dispatch({
        type: 'RECEIVE_NICK',
        connectionId: id,
        oldNickname: e.nick,
        newNickname: e.new
      })
    })

    stream.on('topic', e => {
      dispatch({
        type: 'RECEIVE_TOPIC',
        connectionId: id,
        channel: e.channel,
        topic: e.topic
      })
    })

    stream.on('join', e => {
      dispatch({
        type: 'RECEIVE_JOIN',
        connectionId: id,
        channel: e.channel,
        from: e.nick
      })
    })

    stream.on('names', e => {
      dispatch({
        type: 'RECEIVE_NAMES',
        connectionId: id,
        channel: e.channel,
        names: e.names
      })
    })

    stream.on('message', e => {
      if (e.message.trim().startsWith('\u0001ACTION')) {
        dispatch({
          type: 'RECEIVE_ACTION',
          connectionId: id,
          channel: equalNames(e.to, nickname) ? e.from : e.to,
          from: e.from,
          message: `${e.from} ${e.message.replace(/^\u0001ACTION /, '').replace(/\u0001$/, '')}`
        })
      } else if (equalNames(e.to, nickname)) {
        dispatch({
          type: 'RECEIVE_DIRECT_MESSAGE',
          connectionId: id,
          from: e.from,
          message: e.message
        })
      } else {
        dispatch({
          type: 'RECEIVE_CHANNEL_MESSAGE',
          connectionId: id,
          channel: e.to,
          from: e.from,
          message: e.message
        })
      }
    })
  }
}

function credentialsToId({ realName, server, port }) {
  return `${realName}@${server}:${port}`
}

function createIrcStream(credentials, dispatch) {
  const { realName, nickname, password, server, port } = credentials
  const id = credentialsToId(credentials)

  let stream = net.connect({
    port,
    host: server
  })

  stream.on('connect', e => {
    dispatch({
      type: 'REQUEST_CONNECTION_SUCCESS',
      connectionId: id
    })
  })

  stream.on('close', e => {
    // TODO: figure out how to recover
    // probably want to look at like window focus or "internet is back" events of some sort
    // then check for `ECONNRESET` errors and rebuild the stream(s)
    console.log('stream close', e)
    dispatch({
      type: CONNECTION_CLOSED,
      connectionId: id
    })
  })

  stream.on('error', e => {
    console.log('stream error', e)
    dispatch({
      type: 'REQUEST_CONNECTION_ERROR',
      connectionId: id,
      error: e
    })
  })

  let connection = irc(stream)

  if (password) connection.pass(password)
  connection.nick(nickname)
  connection.user(nickname, realName)

  return connection
}

const leadingChannelName = /^\[(#\S+)\]/
function getChannelFromNotice(message) {
  const match = message.match(leadingChannelName)
  return match ? match[1] : null
}
