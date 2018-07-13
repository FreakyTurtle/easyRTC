import io from 'socket.io-client';
import hark from 'hark';
import {getMedia, Bond} from 'simplertc';

let socket = io('http://localhost:8080/');
let localStream;
let bonds = window.bonds = {};
let room;
let isSpeaking;
let updating;
let muted = false;
let isScreensharing = false;

const video = {
  optional: [
    {minWidth: 320},
    {minWidth: 640},
    {minWidth: 1024},
    {minWidth: 1280}
    // {minWidth: 1920},
    // {minWidth: 2560},
  ]
}
const audio = true;

var screenshare_constraints = {
  audio: false,
  video: {
    ...video,
    mandatory: {
      chromeMediaSource: 'desktop'
    }
  }
}


////////// THIS IS WHERE WE START
const init = (roomToJoin) => {
    return new Promise((resolve, reject) => {
        if(roomToJoin){
            room = roomToJoin;
            getMedia().then((stream) => {
                localStream = stream;
                //ok sweet, local stream is set up, lets join a room
                socket.emit('create or join', room);
                resolve(stream);
            }).catch((error) => {
                reject(error);
            })
        }else{
            reject(new Error("No room name!"))
        }
    });
}

////////// SCOEKT IO JOIN/CREATE ROOM

socket.on('created', function(room, id) {
    //First person in this room
    console.log('Created room ' + room);
    emitEvent('roomcreated', {detail: id});
    if(localStream){
        emitEvent('streamAdded', { detail: 'local' });
    }
});

socket.on('full', function(room){
    // CANNOT JOIN ROOM, IT IS full
    console.warn('Room ' + room + ' is full');
    emitEvent('roomfull', {detail: room});
});

socket.on('join', function(room, id){
    //Someone has joined our room!
    console.log("Someone with id " + id + " has joined room: " + room);
    /////THIS IS WHERE WE SHOULD START THE HANDSHAKING
    bonds[id] = new Bond(localStream, id, sendMessage, callbacks);
    bonds[id].createAndSendOffer();
    emitEvent('newArrival', {detail: id});
});

socket.on('joined', function(room){
    //joined a room, not much useful can really happen here without knowing who else is in the room
    console.log("Joined room: " + room);
    emitEvent('roomjoined', {detail: room});
    if(localStream){
        emitEvent('streamAdded', { detail: 'local' });
    }
});

socket.on('log', function(array){
    console.log.apply(console.array);
});

socket.on('message', (fromId, msg) => {
    //The client has received a msg from the signalling Server
    console.log('Client received message:', msg, fromId); if(msg === 'muted'){
        //One of the people in the room has muted themselves
        emitEvent('streamMuted', {detail: fromId});
    }else if(msg === 'unmuted'){
        //One of the people in the room has unmuted themselves
        emitEvent('streamUnmuted', {detail: fromId});
    }else if(msg === 'bye'){
        //One of the people in the room is leaving, bye felicia
        bonds[fromId].handleRemoteHangup();
        delete bonds[fromId];
    }else if(msg && msg.type){
        switch (msg.type) {
            case 'offer':
                console.log("RECEIVED OFFER");
                if(bonds[fromId]){
                    bonds[fromId].receivedOffer(msg);
                }else{
                    bonds[fromId] = new Bond(localStream, fromId, sendMessage, callbacks);
                    bonds[fromId].receivedOffer(msg);
                }
                break;
            case 'answer':
                console.log("RECEIVED ANSWER");
                bonds[fromId].receivedAnswer(msg);
                break;
            case 'candidate':
                console.log("RECEIVED CANDIDATE");
                if(bonds[fromId]){
                    bonds[fromId].receivedIceCandidate(msg);
                }
                break;
            default:

        }
    }
})

////////// Utility and Callback functions

const emitEvent = (name, obj) => {
    let anonEvent = new CustomEvent(name, obj);
    window.dispatchEvent(anonEvent);
}

const sendMessage = (message, to = null) => {
  console.log('Client sending message: ', message);
  if(!to){
    socket.emit('message', message, room);
  }else{
    socket.emit('message', message, room, to);
  }
}

const callbacks = {
    remoteStreamAdded: (stream, id) => {
        console.log("==== STREAM ====" + stream)
        console.log("Remote stream "+ id + " added");
        //set up speaker swapping
        let speech = hark(stream, {});
        speech.on('speaking', () => {
            //when someone starts speaking, if no one else is already speaking, set them to active
            if(isSpeaking === ''){
                isSpeaking = id;
                emitEvent('activeChange', { detail: id });
            }
        });
        speech.on('stopped_speaking', () => {
            isSpeaking = "";
        });
        emitEvent('streamAdded', { detail: id });
        if(muted){
            sendMessage('muted', id);
        }
    },
    remoteStreamRemoved: (id) => {
        console.log("Remote stream "+ id + " removed");
        emitEvent('streamRemoved', { detail: id});
    },
    onDataReceive: (event) => {
        emitEvent('dataReceived', {detail: event.data});
    }
}

window.onbeforeunload = function() {
    for (var key in bonds){
        if(bonds.hasOwnProperty(key)){
            bonds[key].hangup();
            delete bonds[key];
        }
    }
};

/////////// API CALLS

//PASSIVE

const getLocalStream = () => localStream;
const getRemoteStream = (id) => {
    console.log("====GET REMOTE STREAM ===", id);
    console.log("====GET REMOTE STREAM ===", bonds[id].getRemoteStream().getVideoTracks());
    return bonds[id].getRemoteStream();
};
const getIsScreensharing = () => isScreensharing;

const onRoomJoined = (callback) => {
    window.addEventListener('roomjoined', callback);
    window.addEventListener('roomcreated', callback);
}
const removeOnRoomJoined = (callback) => {
    window.removeEventListener("roomjoined", callback);
    window.removeEventListener("roomcreated", callback);
}
const onRoomFull = (callback) => {
  window.addEventListener('roomfull', callback);
}
const removeOnRoomFull = (callback) => {
    window.removeEventListener("roomfull", callback);
}

const onStreamAdded = (callback) => {
  window.addEventListener('streamAdded', callback);
}
const removeOnStreamAdded = (callback) => {
  window.removeEventListener('streamAdded', callback);
}

const onDataReceived = callback => {
    window.addEventListener('dataReceived', callback);
}
const removeOnDataReceived = callback => {
    window.removeEventListener('dataReceived', callback);
}
const onNewArrival = callback => {
    window.addEventListener('newArrival', callback);
}
const removeOnNewArrival = callback => {
    window.removeEventListener('newArrival', callback);
}

const onStreamRemoved = (callback) => {
  window.addEventListener('streamRemoved', callback);
}
const removeOnStreamRemoved = (callback) => {
  window.removeEventListener('streamRemoved', callback);
}
const onStreamChanged = (callback) => {
  window.addEventListener('streamChanged', callback);
}
const removeOnStreamChanged = (callback) => {
  window.removeEventListener('streamChanged', callback);
}

const onScreenshareToggle = (callback) => {
  window.addEventListener('screenshareToggle', callback);
}
const removeOnScreenshareToggle = (callback) => {
  window.removeEventListener('screenshareToggle', callback);
}

const onStreamMuted = (callback) => {
    window.addEventListener('streamMuted', callback);
}
const removeOnStreamMuted = (callback) => {
    window.removeEventListener('streamMuted', callback);
}

const onStreamUnmuted = (callback) => {
    window.addEventListener('streamUnmuted', callback);
}
const removeOnStreamUnmuted = (callback) => {
    window.removeEventListener('streamUnmuted', callback);
}

const onActiveChange = (callback) => {
  window.addEventListener('activeChange', callback);
}
const removeOnActiveChange = (callback) => {
  window.removeEventListener('activeChange', callback);
}


////active

const muteVideo = () => {
  localStream.getVideoTracks()[0].enabled = false;
}
const unmuteVideo = () => {
  localStream.getVideoTracks()[0].enabled = true;
}

const muteAudio = () => {
  for (var i = 0; i <localStream.getAudioTracks().length; i++) {
    localStream.getAudioTracks()[i].enabled = false;
    muted = true;
    sendMessage('muted');
  }
}
const unmuteAudio = () => {
  for (var i = 0; i <localStream.getAudioTracks().length; i++) {
    localStream.getAudioTracks()[i].enabled = true;
    muted = false;
    sendMessage('unmuted');
  }
}

const hangup = () => {
    for (var key in bonds){
        if(bonds.hasOwnProperty(key)){
            bonds[key].hangup();
            delete bonds[key];
        }
    }
}

const sendData = (msg, type) => {
    for (var key in bonds){
        if(bonds.hasOwnProperty(key)){
            bonds[key].sendData(msg, type);
        }
    }
}

const updateBandwidth = (bw) =>{
    for (var key in bonds){
        if(bonds.hasOwnProperty(key)){
            bonds[key].setBandwidth(
                (bw === 'auto') ? [250, 2250] : [
                    ( (bw * 0.1) > 50 ) ? (bw * 0.1) : 50,
                    (bw * 0.9)
                ]
            );
        }
    }
}

const screenshare = (sharingScreen, source) => {
    return new Promise((resolve, reject) => {
        if(sharingScreen){
            let constraints = screenshare_constraints;
            //we're sharing screen so lets get these
            constraints.video.mandatory['chromeMediaSourceId'] = source.id;
            getMedia(constraints.video, constraints.audio)
            .then((stream) => {
                //remove all the old video tracks
                for (var i = 0; i < localStream.getVideoTracks.length; i++) {
                    localStream.removeTrack(localStream.getVideoTracks[i]);
                }
                //add all the new video tracks
                for (var i = 0; i < stream.getVideoTracks.length; i++) {
                    localStream.addTrack(stream.getVideoTracks[i]);
                }
                //ADD UPDATE CONNECTION HERE
                for (var key in bonds){
                    if(bonds.hasOwnProperty(key)){
                        bonds[key].createAndSendOffer();
                    }
                }
                //tell app the screenshare has toggled
                isScreensharing = true;
                emitEvent('screenshareToggle');
                resolve(localStream);
            }).catch(error => {
                reject(error);
            });
        }else{
            getMedia()
            .then((stream) => {
                //remove all the old video tracks
                for (var i = 0; i < localStream.getVideoTracks.length; i++) {
                    localStream.removeTrack(localStream.getVideoTracks[i]);
                }
                //add all the new video tracks
                for (var i = 0; i < stream.getVideoTracks.length; i++) {
                    localStream.addTrack(stream.getVideoTracks[i]);
                }
                //ADD UPDATE CONNECTION HERE
                for (var key in bonds){
                    if(bonds.hasOwnProperty(key)){
                        bonds[key].createAndSendOffer();
                    }
                }
                //tell app the screenshare has toggled
                isScreensharing = false;
                emitEvent('screenshareToggle');
                resolve(localStream);
            }).catch(error => {
                reject(error);
            });
        }
    })
}

const socketapi = {
  init,
  getLocalStream,
  onStreamAdded,
  removeOnStreamAdded,
  onStreamRemoved,
  removeOnStreamRemoved,
  onStreamChanged,
  removeOnStreamChanged,
  onActiveChange,
  removeOnActiveChange,
  onScreenshareToggle,
  removeOnScreenshareToggle,
  onRoomJoined,
  removeOnRoomJoined,
  onRoomFull,
  removeOnRoomFull,
  onNewArrival,
  removeOnNewArrival,
  onStreamMuted,
  removeOnStreamMuted,
  onStreamUnmuted,
  removeOnStreamUnmuted,
  getRemoteStream,
  muteVideo,
  unmuteVideo,
  muteAudio,
  unmuteAudio,
  screenshare,
  updateBandwidth,
  hangup,
  sendData
}

export {socketapi};
