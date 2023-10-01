const express =require("express");
const path = require("path");

var app = express();
var server = app.listen(3000,(req,res)=>{
    console.log("Server is running on port 3000");
});

const io = require('socket.io')(server,{
    allowEIO3: true, // false by default,
    pingTimeout: 10000,
    pingInterval: 5000
  });

app.use(express.static(path.join(__dirname,"")));

const session = {}
var userConnections = [];

io.on("connection",(socket)=>{
    console.log("Socket is connected and id is " , socket.id);
    socket.on("newUserConnected",(data)=>{
        console.log("New user is connected" , data.displayName ,  data.meetingId);
        session[socket.id] = data;
        var other_users = userConnections.filter((p)=>p.meeting_Id == data.meetingId);

        userConnections.push({
            connId : socket.id,
            user_Id : data.displayName,
            meeting_Id : data.meetingId,
        });

        other_users.forEach((v)=>{
            socket.to(v.connId).emit(
                "inform_others_about_me",
                {
                    other_user_id : data.displayName,
                    connId : socket.id,
                });
        })
        socket.emit("inform_me_about_other_user",other_users);
    });
    socket.on("SDPProcess",(data)=>{
        socket.to(data.to_connid).emit("SDPProcess",{
            message : data.message,
            from_connid : socket.id,
        })
    });
    socket.on("disconnect",(reason)=>{
        userConnections = userConnections.filter((p)=>p.connId != socket.id);
        delete session[socket.id]
        userConnections.forEach((v)=>{
            socket.to(v.connId).emit(
                "user_removed",
                {
                    connId : socket.id,
                });
        })
        console.log("Socket is disconnected and id is " , socket.id , reason);
    })
    socket.on("user_message",(payload)=>{
        console.log("user_message" , payload);
        userConnections.forEach((v)=>{
            socket.to(v.connId).emit(
                "user_message_received_via_server",
                {
                    connId : socket.id,
                    uid: session[socket.id].displayName,
                    data: payload
                });
        })
    })
});