$(document).ready(function(){
    let messages = [];
    let error_count = 0;
    
    function addMessage(name, uid, triphash, mid, message){
        name = name.replace(/</g, "&lt;").replace(/>/g, "&gt;");
        triphash = String(triphash).replace(/</g, "&lt;").replace(/>/g, "&gt;");
        mid = mid.replace(/</g, "&lt;").replace(/>/g, "&gt;");
        message = message.replace(/</g, "&lt;").replace(/>/g, "&gt;");
        $("#chat_log").append(`<div class="chat_message" uid="${uid}" mid="${mid}"><span class="chat_message_sender">${name}</span><span class="chat_message_sender_triphash">${triphash}</span><br><span class="chat_message_message">${message}</span></div>`);
        if(autoScroll){ $("#chat_log").scrollTop($("#chat_log")[0].scrollHeight); }
    }

    function loadMessages() {
        $.ajax({
            url: "/room", method: "POST", data: { action: "fetch" },
            success: function(response) {
                error_count = 0;
                let lastmidindex = response.messages.findIndex(function(message) { return message.id == $("#chat_log").children().last().attr("mid"); });
                if (lastmidindex != -1) { response.messages = response.messages.slice(lastmidindex+1); }
                messages = response.messages;
                users = response.users;
                for(let i=0; i<messages.length; i++){ addMessage(messages[i].handlename, messages[i].username, messages[i].triphash, messages[i].id, messages[i].message); }
                $("#chat_onlineCount").text(response.users.length+"/"+response.max_users);
                $("#chat_roomName").text(response.name);
                $("#members_list").html("");
                for (let i = 0; i < users.length; i++) {
                    users[i].handlename = users[i].handlename.replace(/</g, "&lt;").replace(/>/g, "&gt;");
                    users[i].triphash = users[i].triphash.replace(/</g, "&lt;").replace(/>/g, "&gt;");
                    if(users[i].uid == response.admin_uid) $("#members_list").append(`<div class="member_admin" uid="${users[i].uid}"><span class="member_name">${users[i].handlename}</span><br><span class="member_id">${users[i].triphash}</span><br><span class="member_admin_tag">(admin)</span></div>`);
                    else $("#members_list").append(`<div class="member" uid="${users[i].uid}"><span class="member_name">${users[i].handlename}</span><br><span class="member_id">${users[i].triphash}</span><br>
                    <button class="member_kick_btn" uid="${users[i].uid}">Kick</button><button class="member_ban_btn" uid="${users[i].uid}">Ban</button></div>`);
                }
                if(response.isAdmin){
                    $(".member_kick_btn").css("display", "block");
                    $(".member_ban_btn").css("display", "block");
                    $("#change_max_users_btn").css("display", "block");
                    $("#change_room_name_btn").css("display", "block");
                    $("#handover_host_btn").css("display", "block");
                }
                else{
                    $(".member_kick_btn").css("display", "none");
                    $(".member_ban_btn").css("display", "none");
                    $("#change_max_users_btn").css("display", "none");
                    $("#change_room_name_btn").css("display", "none");
                    $("#handover_host_btn").css("display", "none");
                }
            },
            error: function(xhr, status, error) {
                console.error("Error fetching messages:", error);
                error_count++;
                if(error_count >= 3){
                    window.location = "/lounge";
                }
            }
        });
    }
    window.setInterval(loadMessages, 1000);

    $("#chat_log").on("click", ".chat_message", function() {
        selected= $(this);
        handlename = selected.children(".chat_message_sender").text();
        triphash = selected.children(".chat_message_sender_triphash").text();
        $("#message_input").val($("#message_input").val() + "@" + handlename +":"+ triphash + " ");
        $("#message_input").focus();
    });

    $("#members_list").on("click", ".member_kick_btn", function() {
        $.ajax({
            url: "/room",
            method: "POST",
            data: { action: "kick", target_uid: $(this).attr("uid") },
            success: function(response) {},
            error: function(xhr, status, error) {console.error("Error kicking member:", error);}
        });
    });

    $("#members_list").on("click", ".member_ban_btn", function() {
        $.ajax({
            url: "/room",
            method: "POST",
            data: { action: "ban", target_uid: $(this).attr("uid") },
            success: function(response) {},
            error: function(xhr, status, error) {console.error("Error banning member:", error);}
        });
    });
    

    $("#send_btn").click(function() {
        if($("#message_input").val().length==0 || $("#message_input").val().length>500) return;
        $.ajax({
            url: "/room", 
            method: "POST", 
            data: {action: "send", message: $("#message_input").val()},
            success: function(response) {$("#message_input").val("");},
            error: function(xhr, status, error) {console.error("Error sending message:", error);}
        });
        $("#chat_log").scrollTop($("#chat_log")[0].scrollHeight);
    });

    $("#leave_room_btn").click(function() {
        $.ajax({
            url: "/room",
            method: "POST",
            data: {action: "leave"},
            success: function(response) {window.location.href = "/lounge";},
            error: function(xhr, status, error) {console.error("Error leaving room:", error);}
        });
    });

    $("#message_input").keypress(function(event) { if(event.key === "Enter"){ event.preventDefault(); $("#send_btn").click(); } });

    let autoScroll=true;
    $("#chat_log").scroll(function() { if($("#chat_log").scrollTop() + $("#chat_log").height() >= $("#chat_log").prop("scrollHeight")) autoScroll = true; else autoScroll = false; });

    $("#show_side_panel_btn").click(function(){
        $("#side_panel").css("display", "block");
        $("#side_panel").css("width", "360px");
        $("#side_panel").css("opacity", "1");
        $("#side_panel").css("z-index", "1");
        $("#side_panel").css("pointer-events", "auto");
        $("#side_panel").css("transition", "width 0.5s, opacity 0.5s, z-index 0.5s, pointer-events 0.5s");
    });

    $("#hide_side_panel_btn").click(function(){
        $("#side_panel").css("width", "0px");
        $("#side_panel").css("opacity", "0");
        $("#side_panel").css("z-index", "-1");
        $("#side_panel").css("pointer-events", "none");
        $("#side_panel").css("transition", "width 0.5s, opacity 0.5s, z-index 0.5s, pointer-events 0.5s");
    });
});
