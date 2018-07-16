let remoteStreams = {};
let localStream;

let defaultVideoConstraints = {
  optional: [
    {minWidth: 320},
    {minWidth: 640},
    {minWidth: 1024},
    {minWidth: 1280}
    // {minWidth: 1920},
    // {minWidth: 2560},
  ]
};
let defaultAudioConstraints = true;

var defaultServers = {
  'iceServers': [{
    'urls': ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302', 'stun:stun2.l.google.com:19302']
  }]
};

export const getMedia = (video = defaultVideoConstraints, audio = defaultAudioConstraints) => {
    let constraints = {
        video,
        audio
    };
    return new Promise((resolve, reject) => {
        navigator.mediaDevices.getUserMedia(constraints)
        .then((stream) => {
            resolve(stream);
        })
        .catch((err) => {
            reject(err);
        });
    });
};

export class Bond {
    constructor(localMedia, id, sendMsgFunction, callbacks = {}, bandwidth = [250, 2250], servers = defaultServers){
        console.log("=== CONSTRUCTOR ===");
        this.localStream = localMedia;
        this.remoteStream;
        this.id = id;
        this.callbacks = callbacks;
        this.sendMessage = sendMsgFunction;
        this.servers = servers;
        this.bandwidth = bandwidth;
        this.pc = new RTCPeerConnection(this.servers);
        //function bindings
        this.handleIceCandidate = this.handleIceCandidate.bind(this);
        this.handleRemoteStreamAdded = this.handleRemoteStreamAdded.bind(this);
        this.handleRemoteStreamRemoved = this.handleRemoteStreamRemoved.bind(this);
        this.onDataChannelOpen = this.onDataChannelOpen.bind(this);
        this.onDataChannelReceive = this.onDataChannelReceive.bind(this);
        this.getBandwidth = this.getBandwidth.bind(this);

        this.dataChannel = this.pc.createDataChannel("data", {negotiated: true, id: 7});
        this.dataChannel.onopen = this.onDataChannelOpen;
        this.dataChannel.onmessage = this.onDataChannelReceive;

        this.pc.onicecandidate = this.handleIceCandidate;
        this.pc.onaddstream = this.handleRemoteStreamAdded;
        this.pc.onremovestream = this.handleRemoteStreamRemoved;

        this.pc.addStream(this.localStream);
    }

    createAndSendOffer(){
        console.log("=== CREATE AND SEND OFFER ===");
        this.pc.createOffer()
        .then((createdOffer) => {
            this.pc.setLocalDescription(createdOffer);
            createdOffer.sdp = this.setSessionDescriptionBandwidth(createdOffer.sdp);
            this.sendMessage(createdOffer);
        }).catch((error) => {
            console.error('Failed to create session description: ' + error.toString());
        });
    }

    receivedOffer(msg){
        console.log("=== RECEIVED OFFER ===");
        this.pc.setRemoteDescription(new RTCSessionDescription(msg));
        let bw = this.getBandwidth(msg.sdp);
        //if their bandwidth is set to lower than ours, default to theirs
        if((this.bandwidth[0] + this.bandwidth[0]) > (bw[0] + bw[1])){
            this.bandwidth = bw;
        }
        this.createAndSendAnswer();
    }

    createAndSendAnswer(){
        console.log("=== CREATE AND SEND ANSWER ===");
        this.pc.createAnswer()
        .then((createdAnswer) => {
            this.pc.setLocalDescription(createdAnswer);
            createdAnswer.sdp = this.setSessionDescriptionBandwidth(createdAnswer.sdp);
            this.sendMessage(createdAnswer, this.id);
        }).catch((error) => {
            console.error('Failed to create session description: ' + error.toString());
        });
    }

    receivedAnswer(msg){
        console.log("=== RECEIVED ANSWER ===");
        this.pc.setRemoteDescription(new RTCSessionDescription(msg));
    }

    receivedIceCandidate(msg){
        let candidate = new RTCIceCandidate({
            sdpMLineIndex: msg.label,
            candidate: msg.candidate
        });
        this.pc.addIceCandidate(candidate);
    }

    handleIceCandidate(event){
        //so a network candidate became available
        const peerConnection = event.target;
        const iceCandidate = event.candidate;
        if(iceCandidate){
            console.log('icecandidate event: ', event);
            if (event.candidate) {
                this.sendMessage({
                    type: 'candidate',
                    label: event.candidate.sdpMLineIndex,
                    id: event.candidate.sdpMid,
                    candidate: event.candidate.candidate
                }, this.id);
            } else {
                console.log('End of candidates.');
            }
        }
    }

    handleRemoteStreamAdded(event){
        this.remoteStream = event.stream;
        if(this.callbacks.remoteStreamAdded){
            this.callbacks.remoteStreamAdded(this.remoteStream, this.id);
        }
    }
    handleRemoteStreamRemoved(event){
        this.remoteStream = null;
        if(this.callbacks.remoteStreamRemoved){
            this.callbacks.remoteStreamRemoved(this.id);
        }
    }
    hangup(){
        this.pc.close();
        this.pc = null;
        this.sendMessage('bye', this.id);
    }
    handleRemoteHangup(){
        this.pc.close();
        this.pc = null;
    }

    //// data channel

    onDataChannelOpen(event){
        console.log("=== DATA CHANNEL OPEN ===");
    }

    onDataChannelReceive(event){
        console.log("received data", event);
        this.callbacks.onDataReceive(event);
    }

    sendData(message){
        this.dataChannel.send(message);
    }

    //// getters and setters

    getIceConnectionState(){
        if(!this.pc){
            return false;
        }
        return this.pc.iceConnectionState;
    }

    getLocalStream(){
        return this.localStream;
    }
    getRemoteStream(){
        return this.remoteStream;
    }
    getCallbacks(){
        return this.callbacks;
    }
    getSendMessage(){
        return this.sendMessage;
    }
    getConnection(){
        return this.pc;
    }
    getServers(){
        return this.servers;
    }

    setBandwidth(bw = [250, 2250]){
        this.bandwidth = bw;
        this.createAndSendOffer();
    }

    getBandwidth(sdp){
      var lines = sdp.split("\n");
      var ret = [];
      for (var i = 0; i < lines.length; i++) {
        if(lines[i].indexOf("b=AS:") > -1){
          ret.push(parseInt(lines[i].split(":")[1]));
        }
      }
      return ret;
    }

    // UTILITY

    setSessionDescriptionBandwidth(sdp) {
        var modifier = 'AS';
        var count = 0;
        var lines = sdp.split("\n");
        var add_audio = 0;
        var add_video = 0;
        for (var i = 0; i < lines.length; i++) {
          let line = lines[i];
          if(line.indexOf("m=audio") > -1){
            if(lines[i+2].indexOf("b=AS") > -1){
              lines[i+2] = "b=AS:" + this.bandwidth[0];
            }else{
              add_audio = i+2;
            }
          }
          if(line.indexOf("m=video") > -1){
            if(lines[i+2].indexOf("b=AS") > -1){
              lines[i+2] = "b=AS:"+this.bandwidth[1];
            }else{
              add_video = i+2;
            }
          }
        }
        if(add_audio > 0){
          lines.splice(add_audio, 0, "b=AS:"+this.bandwidth[0]);
        }
        if(add_video){
          lines.splice((add_audio > 0) ? (add_video + 1) : add_video, 0, "b=AS:"+this.bandwidth[1]);
        }

        return lines.join("\n");
    }

}
