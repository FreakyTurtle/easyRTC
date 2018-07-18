'use strict';

Object.defineProperty(exports, "__esModule", {
    value: true
});

var _createClass = function () { function defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ("value" in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; }();

exports.getMedia = getMedia;

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }

var remoteStreams = {};
var localStream = void 0;

var defaultVideoConstraints = {
    optional: [{ minWidth: 320 }, { minWidth: 640 }, { minWidth: 1024 }, { minWidth: 1280
        // {minWidth: 1920},
        // {minWidth: 2560},
    }]
};
var defaultAudioConstraints = true;

var defaultServers = {
    'iceServers': [{
        'urls': ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302', 'stun:stun2.l.google.com:19302']
    }]
};

function getMedia(video, audio) {
    var constraints = {
        video: video ? video : defaultVideoConstraints,
        audio: audio ? audio : defaultAudioConstraints
    };
    return new Promise(function (resolve, reject) {
        navigator.mediaDevices.getUserMedia(constraints).then(function (stream) {
            resolve(stream);
        }).catch(function (err) {
            reject(err);
        });
    });
};

var Bond = exports.Bond = function () {
    function Bond(localMedia, id, sendMsgFunction) {
        var callbacks = arguments.length > 3 && arguments[3] !== undefined ? arguments[3] : {};
        var bandwidth = arguments.length > 4 && arguments[4] !== undefined ? arguments[4] : [250, 2250];
        var servers = arguments.length > 5 && arguments[5] !== undefined ? arguments[5] : defaultServers;

        _classCallCheck(this, Bond);

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

        this.dataChannel = this.pc.createDataChannel("data", { negotiated: true, id: 7 });
        this.dataChannel.onopen = this.onDataChannelOpen;
        this.dataChannel.onmessage = this.onDataChannelReceive;

        this.pc.onicecandidate = this.handleIceCandidate;
        this.pc.onaddstream = this.handleRemoteStreamAdded;
        this.pc.onremovestream = this.handleRemoteStreamRemoved;

        this.pc.addStream(this.localStream);
    }

    _createClass(Bond, [{
        key: 'createAndSendOffer',
        value: function createAndSendOffer() {
            var _this = this;

            console.log("=== CREATE AND SEND OFFER ===");
            this.pc.createOffer().then(function (createdOffer) {
                _this.pc.setLocalDescription(createdOffer);
                createdOffer.sdp = _this.setSessionDescriptionBandwidth(createdOffer.sdp);
                _this.sendMessage(createdOffer);
            }).catch(function (error) {
                console.error('Failed to create session description: ' + error.toString());
            });
        }
    }, {
        key: 'receivedOffer',
        value: function receivedOffer(msg) {
            console.log("=== RECEIVED OFFER ===");
            this.pc.setRemoteDescription(new RTCSessionDescription(msg));
            var bw = this.getBandwidth(msg.sdp);
            //if their bandwidth is set to lower than ours, default to theirs
            if (this.bandwidth[0] + this.bandwidth[0] > bw[0] + bw[1]) {
                this.bandwidth = bw;
            }
            this.createAndSendAnswer();
        }
    }, {
        key: 'createAndSendAnswer',
        value: function createAndSendAnswer() {
            var _this2 = this;

            console.log("=== CREATE AND SEND ANSWER ===");
            this.pc.createAnswer().then(function (createdAnswer) {
                _this2.pc.setLocalDescription(createdAnswer);
                createdAnswer.sdp = _this2.setSessionDescriptionBandwidth(createdAnswer.sdp);
                _this2.sendMessage(createdAnswer, _this2.id);
            }).catch(function (error) {
                console.error('Failed to create session description: ' + error.toString());
            });
        }
    }, {
        key: 'receivedAnswer',
        value: function receivedAnswer(msg) {
            console.log("=== RECEIVED ANSWER ===");
            this.pc.setRemoteDescription(new RTCSessionDescription(msg));
        }
    }, {
        key: 'receivedIceCandidate',
        value: function receivedIceCandidate(msg) {
            var candidate = new RTCIceCandidate({
                sdpMLineIndex: msg.label,
                candidate: msg.candidate
            });
            this.pc.addIceCandidate(candidate);
        }
    }, {
        key: 'handleIceCandidate',
        value: function handleIceCandidate(event) {
            //so a network candidate became available
            var peerConnection = event.target;
            var iceCandidate = event.candidate;
            if (iceCandidate) {
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
    }, {
        key: 'handleRemoteStreamAdded',
        value: function handleRemoteStreamAdded(event) {
            this.remoteStream = event.stream;
            if (this.callbacks.remoteStreamAdded) {
                this.callbacks.remoteStreamAdded(this.remoteStream, this.id);
            }
        }
    }, {
        key: 'handleRemoteStreamRemoved',
        value: function handleRemoteStreamRemoved(event) {
            this.remoteStream = null;
            if (this.callbacks.remoteStreamRemoved) {
                this.callbacks.remoteStreamRemoved(this.id);
            }
        }
    }, {
        key: 'hangup',
        value: function hangup() {
            this.pc.close();
            this.pc = null;
            this.sendMessage('bye', this.id);
        }
    }, {
        key: 'handleRemoteHangup',
        value: function handleRemoteHangup() {
            this.pc.close();
            this.pc = null;
        }

        //// data channel

    }, {
        key: 'onDataChannelOpen',
        value: function onDataChannelOpen(event) {
            console.log("=== DATA CHANNEL OPEN ===");
        }
    }, {
        key: 'onDataChannelReceive',
        value: function onDataChannelReceive(event) {
            console.log("received data", event);
            this.callbacks.onDataReceive(event);
        }
    }, {
        key: 'sendData',
        value: function sendData(message) {
            this.dataChannel.send(message);
        }

        //// getters and setters

    }, {
        key: 'getIceConnectionState',
        value: function getIceConnectionState() {
            if (!this.pc) {
                return false;
            }
            return this.pc.iceConnectionState;
        }
    }, {
        key: 'getLocalStream',
        value: function getLocalStream() {
            return this.localStream;
        }
    }, {
        key: 'getRemoteStream',
        value: function getRemoteStream() {
            return this.remoteStream;
        }
    }, {
        key: 'getCallbacks',
        value: function getCallbacks() {
            return this.callbacks;
        }
    }, {
        key: 'getSendMessage',
        value: function getSendMessage() {
            return this.sendMessage;
        }
    }, {
        key: 'getConnection',
        value: function getConnection() {
            return this.pc;
        }
    }, {
        key: 'getServers',
        value: function getServers() {
            return this.servers;
        }
    }, {
        key: 'setBandwidth',
        value: function setBandwidth() {
            var bw = arguments.length > 0 && arguments[0] !== undefined ? arguments[0] : [250, 2250];

            this.bandwidth = bw;
            this.createAndSendOffer();
        }
    }, {
        key: 'getBandwidth',
        value: function getBandwidth(sdp) {
            var lines = sdp.split("\n");
            var ret = [];
            for (var i = 0; i < lines.length; i++) {
                if (lines[i].indexOf("b=AS:") > -1) {
                    ret.push(parseInt(lines[i].split(":")[1]));
                }
            }
            return ret;
        }

        // UTILITY

    }, {
        key: 'setSessionDescriptionBandwidth',
        value: function setSessionDescriptionBandwidth(sdp) {
            var modifier = 'AS';
            var count = 0;
            var lines = sdp.split("\n");
            var add_audio = 0;
            var add_video = 0;
            for (var i = 0; i < lines.length; i++) {
                var line = lines[i];
                if (line.indexOf("m=audio") > -1) {
                    if (lines[i + 2].indexOf("b=AS") > -1) {
                        lines[i + 2] = "b=AS:" + this.bandwidth[0];
                    } else {
                        add_audio = i + 2;
                    }
                }
                if (line.indexOf("m=video") > -1) {
                    if (lines[i + 2].indexOf("b=AS") > -1) {
                        lines[i + 2] = "b=AS:" + this.bandwidth[1];
                    } else {
                        add_video = i + 2;
                    }
                }
            }
            if (add_audio > 0) {
                lines.splice(add_audio, 0, "b=AS:" + this.bandwidth[0]);
            }
            if (add_video) {
                lines.splice(add_audio > 0 ? add_video + 1 : add_video, 0, "b=AS:" + this.bandwidth[1]);
            }

            return lines.join("\n");
        }
    }]);

    return Bond;
}();
