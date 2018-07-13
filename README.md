# simpleRTC
An npm package that makes using the powerful technologies behind webRTC a breeze.


## Installation

To install simpleRTC, run

`npm install --save simpleRTC`

## Usage


### Audio and video

If you want to exchange/display media, first you need to get it using the `getMedia` function that returns a promise with the resulting stream.

getMedia takes two parameters, both are optional

`video_constraints` is a json object or boolean describing the video constraints.

Default value:
```javascript
{
  optional: [
    {minWidth: 320},
    {minWidth: 640},
    {minWidth: 1024},
    {minWidth: 1280}
  ]
}
```

`audio_constraints` is a json object or boolean describing the audio constraints.

Default value: `true`

For more information about what constraints area available see [Mozilla's guide to constraints](https://developer.mozilla.org/en-US/docs/Web/API/Media_Streams_API/Constraints)

Example usage

```javascript
import {getMedia} from 'simpleRTC';

let video_constraints = {
    optional: [
      {minWidth: 320},
      {minWidth: 640}
    ]
};

let audio_constraints = false;

getMedia(video_constraints, audio_constraints)
    .then((stream) => {
        // Here you could set the srcObject of a video element to the stream returned
        // the stream object in this instance would be a low-res vdieo with no audio.
        })
    .catch((err) => {
        console.error(err)
        });

```


### Bonds

The `Bond` class is how simpleRTC sets up connections with other clients.

>Why have you not used a name more similar to webRTC's?

We decided to name our class differently to the default webRTC technology names such as peerConnection to avoid confusion between the two, and bond seemed a suitable, short-to-type synonym.

The Bond class constructor takes 6 parameters that help you get started and set up

##### localStream
*Stream ---required*

This is usually the returned stream value from a getMedia call, this stream will then be sent to the the other client with whom a bond has been established.  (i.e this is the video/audio yout're sending to another person).  If this value is set to `null` it will be assumed that the bond is a data-only connection.

##### id
*String ---required*

This is an identifying string that references this bond, and only this bond.  This is useful in a situation where you have multiple bond connections, for instance in a video chat with more than one person, and you need to know which bond has generated a call to a callback function.

##### sendMsgFunction(msg, to)
*Function ---required*

This is a special callback function for the signalling methodology used.  Signalling is not handled by simpleRTC as it is just an interface to using the webRTC technologies.  We provide more information about signalling [here](#signalling).

The sendMsgFunction must take two parameters, a `msg` parameter and a `to` parameter.

Messages that can be sent to this function will include the offer, answers and ICECandidates created by webRTC's peerConnection, and the word 'bye' when hanging up to signal to connected bonds to handle the hangup.

An example sendMessage function where signalling is done with socket.io might look like...
```javascript
(message, to = null) => {
  console.log('Client sending message: ', message);
  if(!to){
    socket.emit('message', message, room);
  }else{
    socket.emit('message', message, room, to);
  }
}
```

##### callbacks
*Object ---optional*

Default value : `{}`

The callbacks object contains functions to be called at certain times in the webRTC process, in case the app needs to handle changes to the bond.  The functions this object can include as needed are....

`remoteStreamAdded(stream, id)` *returns a stream when one is added to the bond by the other client.*

`remoteStreamRemoved(id)` *notification that a stream has been removed.*

`onDataReceive(event)` *notification that data has been received from the other client.*

##### bandwidth
*Array ---optional*

Default value : `[250, 2250]`

This is an array that sets the max bandwidth for the audio and video streams in that order (in kbps).

##### servers
*Object ---optional*

Default value:
```javascript
{
  'iceServers': [{
    'urls': [
        'stun:stun.l.google.com:19302',
        'stun:stun1.l.google.com:19302',
        'stun:stun2.l.google.com:19302']
  }]
};
```

This object sets the description for STUN and TURN servers.  By default, this is set to include some free to use STUN servers from google.  In (very) brief - a STUN server helps the peer figure out how it can be found by another client, and a TURN server is a fallback, if the peer-to-peer connection is too difficult to establish (one peer is behind complicated network) then all the traffic is sent through the TURN server in a old-school way.

WARNING - TURN servers for video and audio, given the high bandwidth usage, can quickly become very expensive.


#### Example Bond Declaration

```javascript
import {getMedia, Bond} from 'simpleRTC';

let bond;
let id = '12345';
let video_constraints = {
    optional: [
      {minWidth: 320},
      {minWidth: 640}
    ]
};

let audio_constraints = true;

const sendMessage = (message, to = null) => {
  console.log('Client sending message: ', message);
  if(!to){
    socket.emit('message', message, room);
  }else{
    socket.emit('message', message, room, to);
  }
}

let callbacks = {
    remoteStreamAdded: (stream, id) => {
        console.log("==== STREAM ====" + stream)
        console.log("Remote stream "+ id + " added");
        //here you could handle any new usage of the stream, for example you could set a video elements srcObject or use the hark library to handle which audio stream is talking
    },
    remoteStreamRemoved: (id) => {
        console.log("Remote stream "+ id + " removed");
        emitEvent('streamRemoved', { detail: id});
    },
    onDataReceive: (event) => {
        emitEvent('dataReceived', {detail: event.data});
    }
}

const emitEvent = (name, obj) => {
    let anonEvent = new CustomEvent(name, obj);
    window.dispatchEvent(anonEvent);
}


getMedia(video_constraints, audio_constraints)
    .then((stream) => {
        bond = new Bond(stream, id, sendMessage, callbacks);
        bond.createAndSendOffer();
        })
    .catch((err) => {
        console.error(err)
        });

```


#### createAndSendOffer()

This function is the starting point for connecting the Bond class.  It handles creating the offer and sending it through the sendMsgFunction, as well as handling all the bandwidth and SDP protocols

#### receivedOffer(msg)

This function should be called when handling signalling and an offer has been received.

socket.io example
```javascript
socket.on('message', (fromId, msg) => {
    switch (msg.type){
        case 'offer':
            console.log("RECEIVED OFFER");
            bond = new Bond(localStream, fromId, sendMessage, callbacks);
            bond.receivedOffer(msg);
            break;
    }
});
```

#### receivedAnswer(msg)

This function should be called when handling signalling and an answer has been received.

socket.io example
```javascript
socket.on('message', (fromId, msg) => {
    switch (msg.type){
        case 'answer':
            console.log("RECEIVED ANSWER");
            bond.receivedAnswer(msg);
            break;
    }
});
```

#### receivedIceCandidate(msg)

This function should be called when handling signalling and an iceCandidate has been received.

socket.io example
```javascript
socket.on('message', (fromId, msg) => {
    switch (msg.type){
        case 'candidate':
            console.log("RECEIVED CANDIDATE");
            if(bond){
                bond.receivedIceCandidate(msg);
            }
    }
});
```

#### hangup()

Hangs up the bond connection and sends the signalling message `bye`

#### sendData(msg)

Sends data to the connected client through the peer-to-peer connection.

#### setBandwidth(bandwidth)

Resets the max bandwidth data for the bond

`bandwidth` is an array of the audio, video (integers) max bandwidth in kbps


## Signalling

Signalling is the process of using an intermediary server to help two clients find each other and exchange the information necessary to establish a peer-to-peer connection.

While it is not part of the webRTC technology it is inextricably linked to it as webRTC depends on signalling to work.  Since the methodology for signalling is up to you, you can use any technology implement it, however for using simpleRTC we highly recommend using socket.io

## Examples

In the examples folder we have put a few files to help you get up and running using simpleRTC.

In the [client-side-socket](https://github.com/FreakyTurtle/simpleRTC/blob/master/examples/client-side-socket.js) file you will find an entire socketapi for a multi-peer video conferencing app with text/data transfer.

In the [server-side-socket](https://github.com/FreakyTurtle/simpleRTC/blob/master/examples/serve-side-socket.js) you will find a basic example for a socket.io/express signalling server (this file would be the basis of an app.js file)

Both of these examples will probably become packages/open source projects of their own very shortly, as will an entire, brandable video chat app.  This app will hopefully allow it to be easy to pull the code, brand/personlise the app, install a quick server, and release the app with things like automated updates, so any tech team can set up their team or business with its own, branded, video conferencing app.
