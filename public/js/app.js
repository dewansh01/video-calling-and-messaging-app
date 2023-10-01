
var appProcess = (function () {

    var peers_connection = [];
    var remote_vid_stream = [];
    var remote_aud_stream = [];
    var serverProcess;
    var local_div;
    var audio;
    var isAudioMute = false;
    var rtp_aud_senders = [];
    var video_states = {
        None: 0,
        Camera: 1,
        ScreenShare: 2,
    }

    var video_st = video_states.None;
    var videoCamTrack;
    async function _init(SDP_function, my_connid) {//async function not needed

        serverProcess = SDP_function;
        eventProcess();
        local_div = document.getElementById(`v_${my_connid}`);

    }

    function eventProcess() {
        $("#camera-btn").on("click", async function () {
            if (video_st == video_states.Camera) {
                await videoProcess(video_states.None);
            }
            else {
                await videoProcess(video_states.Camera);
            }
        })
        $("#share-btn").on("click", async function () {
            if (video_st == video_states.ScreenShare) {
                await videoProcess(video_states.None);
            }
            else {
                await videoProcess(video_states.ScreenShare);
            }
        })
    }
    async function videoProcess(newVideoState, connId = null) {
        try {
            var vstream = null;
            if (newVideoState == video_states.Camera) {
                vstream = await navigator.mediaDevices.getUserMedia({
                    video: {
                        //set different values for width and height smaller values for better performance
                        width: 1920,
                        height: 1080
                    },
                    audio: false
                });
            } else if (newVideoState == video_states.ScreenShare) {
                vstream = await navigator.mediaDevices.getDisplayMedia({
                    video: {
                        width: 1920,
                        height: 1080
                    },
                    audio: false
                });
            }
        } catch (e) {
            console.log(e);
            return;
        }

        video_st = newVideoState;
        if (vstream && vstream.getVideoTracks().length > 0) {
            videoCamTrack = vstream.getVideoTracks()[0];
            if (videoCamTrack) {
                local_div.srcObject ||= new MediaStream([videoCamTrack]);
                if (connId) {
                    peers_connection[connId].addTrack(videoCamTrack);
                } else {
                    Object.values(peers_connection).forEach((pc) => {
                        pc.addTrack(videoCamTrack);
                    });
                }
                alert("Video is on");
            }
        } else {
            // Handle the case where vstream is not obtained successfully
            alert("Failed to obtain video stream.");
        }
    }

    var iceConfiguration = {
        iceServers: [
            {
                urls: "stun:stun.l.google.com:19302",
            },
            {
                urls: "stun:stun1.l.google.com:19302",
            },
            {
                urls: "stun:stun2.l.google.com:19302",
            },
            {
                urls: "stun:stun3.l.google.com:19302",
            },
            {
                urls: "stun:stun4.l.google.com:19302",
            },
        ]
    }


    async function setConnection(connid) {
        var connection = new RTCPeerConnection(iceConfiguration);


        // peers_connection_ids[connid] = connid;
        peers_connection[connid] = connection;

        connection.onnegotiationneeded = async function (event) {
            await setOffer(connid);
        }
        connection.onicecandidate = function (event) {
            if (event.candidate) {
                serverProcess(JSON.stringify({
                    icecandidate: event.candidate,
                }), connid);
            }
        };

        connection.ontrack = function (event) {
            if (!remote_vid_stream[connid]) {
                remote_vid_stream[connid] = new MediaStream();
            }
            if (!remote_aud_stream[connid]) {
                remote_aud_stream[connid] = new MediaStream();
            }
            if (event.track.kind == "video") {
                remote_vid_stream[connid].addTrack(event.track);
                var remoteVideoPlayer = document.getElementById("v_" + connid);
                remoteVideoPlayer.srcObject = remote_vid_stream[connid];
                remoteVideoPlayer.load();
            }
            else if (event.track.kind == "audio") {
                remote_aud_stream[connid].addTrack(event.track);
                var remoteAudioPlayer = document.getElementById("a_" + connid);
                remoteAudioPlayer.srcObject = remote_aud_stream[connid];
                remoteAudioPlayer.load();
            }
        }
        return connection;
    }

    async function setOffer(connid) {
        var connection = peers_connection[connid];
        var offer = await connection.createOffer();

        await connection.setLocalDescription(offer);
        serverProcess(JSON.stringify({
            offer: connection.localDescription,
        }), connid)
    }

    async function SDPProcess(message, from_connid) {
        message = JSON.parse(message);
        if (message.answer) {
            await peers_connection[from_connid].setRemoteDescription(new RTCSessionDescription(message.answer));
        }
        else if (message.offer) {
            if (!peers_connection[from_connid]) {
                await setConnection(from_connid);
            }//if connection is not set then set connection
            await peers_connection[from_connid].setRemoteDescription(new RTCSessionDescription(message.offer));
            var answer = await peers_connection[from_connid]
                .createAnswer();
            await peers_connection[from_connid].setLocalDescription(answer);
            serverProcess(
                JSON.stringify({
                    answer: answer,
                }),
                from_connid
            );
        } else if (message.icecandidate) {
            if (!peers_connection[from_connid]) {
                await setConnection(from_connid);
            }
            try {
                await peers_connection[from_connid].addIceCandidate(message.icecandidate);
            } catch (e) {
                console.log(e);
            }
        }
    }

    return {
        setNewConnection: async function (connid) {
            await setConnection(connid);
        },
        init: async function (SDP_function, uid, my_connid) {
            await _init(SDP_function, uid, my_connid);
        },
        processClientFunction: async function (data, from_connid) {
            await SDPProcess(data, from_connid);
        },
        getVideoState: () => video_st,
        getVideoStates: () => video_states,
        videoProcess: videoProcess
    }
})();


var myApp = (function () {

    var user_Id = null;
    var meeting_Id = null;
    var socket = null;

    function init(uid, mid) {
        user_Id = uid;
        meeting_Id = mid;
        document.title = user_Id;
        event_process_for_signalling_server();
    }

    function event_process_for_signalling_server() {
        socket = io.connect();


        var SDP_function = function (data, connid) {
            socket.emit("SDPProcess", {
                message: data,
                to_connid: connid
            })
        };
        //SDP_function is used to send SDP to server
        socket.on("connect", () => {
            //for RTC
            AddUser(user_Id, socket.id);
            appProcess.init(SDP_function, socket.id);

            //for socket
            socket.emit("newUserConnected", {
                displayName: user_Id,
                meetingId: meeting_Id,
            });

        });
        
        socket.on("inform_others_about_me", (data) => {
            AddUser(data.other_user_id, data.connId);
            appProcess.setNewConnection(data.connId);
            if (appProcess.getVideoState() !== appProcess.getVideoStates().None) {
                appProcess.videoProcess(appProcess.getVideoState(), data.connId);//
            }
        });
        socket.on("inform_me_about_other_user", (other_users) => {
            if (other_users) {
                for (var i = 0; i < other_users.length; i++) {
                    AddUser(other_users[i].user_Id, other_users[i].connId);
                    appProcess.setNewConnection(other_users[i].connId);
                }
            }
        });
        
        socket.on("user_message_received_via_server", (data) => {
            console.log("user_message_received", data);
            AddMessage(data);
        });
        socket.on("user_removed", ({ connId }) => removeUser(connId));

        socket.on("SDPProcess", async function (data) {
            await appProcess.processClientFunction(
                data.message,
                data.from_connid
            );
        });

    }

    function AddUser(member_name, connId) {
        $('#streams__container').append(getVideoHTML());
        $('#member__list').append(participantHTML());
        updateCount();
        function getVideoHTML() {
            return `<span class ="video__container" id="view_${connId}">
                <h2 class="video_title">${member_name}</h2>
                <video class="video-player" id="v_${connId}" autoplay playsinline></video>
                <audio class="audio-player"  id="a_${connId}" autoplay></audio>
            </span>`;
        }
        function participantHTML() {
            return `<div class="member__wrapper" id="member__${connId}__wrapper">
            <span class="green__icon"></span>
            <p class="member_name">${member_name}</p>
        </div>`
        }
    }
    function AddMessage({ connId, uid, data }) {
        $('#messages').append(getHTML());
        function getHTML() {
            return `<div class="message__wrapper ${connId === socket.id ? 'message__wrapper--mine' : ''}">
            <div class="message__body">
                <strong class="message__author">${uid}</strong>
                <p class="message__text">${data.message}</p>
            </div>
        </div>`
        }
    }
    function updateCount() {
        $('#members__count').text($('#member__list').children().length);
    }
    function removeUser(connId) {
        $(`#view_${connId}`).remove();
        $(`#member__${connId}__wrapper`).remove();
        updateCount();
    }

    return {
        _init: function (uid, mid) {
            init(uid, mid);
        },
        emit: function (event, data) {
            socket.emit(event, data);
        },
        addMessage: (data) => AddMessage({
            connId: socket.id,
            uid: user_Id,
            data
        })
    };
})();