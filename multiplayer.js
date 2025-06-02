(function () {
  function initMultiplayer() {
    if (typeof io !== "function") {
      console.warn("Socket.IO not loaded. Retrying...");
      return setTimeout(initMultiplayer, 200);
    }
    if (!window.player || !window.ctx) {
      console.warn("Game not ready (player or ctx missing). Retrying...");
      return setTimeout(initMultiplayer, 200);
    }
    
    const socket = io();
    window.socket = socket;

    window.sendChat = function(msg) {
      socket.emit("chat", {
        sender: {
          name: window.player.name,
          color: window.player.color,
          title: window.player.title || ""
        },
        message: msg,
        timestamp: Date.now()
      });
    };
    
    let otherPlayers = {};
    window.otherPlayers = otherPlayers;
    
    socket.on("playerMoved", (data) => {
      otherPlayers[data.id] = data;
    });
    
    socket.on("playerDisconnected", (id) => {
      delete otherPlayers[id];
    });
    
    socket.on("adminUpdate", (data) => {
      for (const id in otherPlayers) {
        if (otherPlayers[id].name === data.playerName) {
          if (data.newClass) otherPlayers[id].class = data.newClass;
          if (data.muted !== undefined) otherPlayers[id].muted = data.muted;
        }
      }
    });
    
    socket.on("effect", function(data) {
      if (typeof createEffect === "function" &&
          (gameState === "dungeon" || data.color === "gold")) {
        createEffect(data.x, data.y, data.color);
      }
    });
    
    socket.on("globalNotification", function(data) {
      if(data.color && data.font && typeof displayGlobalAnnouncement === "function"){
        displayGlobalAnnouncement(data.msg, data.color, data.font);
      } else if (typeof showGlobalNotification === "function") {
        showGlobalNotification(data.msg, data.duration);
      }
    });
    
    socket.on("adminAnnouncement", function(data) {
      if (typeof displayGlobalAnnouncement === "function") {
        displayGlobalAnnouncement(data.text, data.color, data.font);
      }
    });
    
    socket.on("chat", function (data) {
      let key = data.sender.name + "_" + data.timestamp;
      if (window.processedMessages && window.processedMessages.has(key)) return;
      if (!window.processedMessages) window.processedMessages = new Set();
      window.processedMessages.add(key);
      
      const chatBox = document.getElementById("chatMessages");
      if (chatBox) {
        if(data.sender.muted) return;
        let msgDiv = document.createElement("div");
        msgDiv.style.margin = "2px 0";
        msgDiv.style.padding = "3px";
        msgDiv.style.borderBottom = "1px solid rgba(255,255,255,0.1)";
        msgDiv.style.fontSize = "12px";
        let senderIcon = `<span style="display:inline-block; width:10px; height:10px; background:${data.sender.color}; border-radius:50%; margin-right:5px;"></span>`;
        let senderTitle = data.sender.title ? `<span style="color:#ff0000;">[${data.sender.title}]</span> ` : "";
        msgDiv.innerHTML = `${senderIcon}<strong>${data.sender.name}</strong> ${senderTitle}: ${data.message}`;
        chatBox.appendChild(msgDiv);
        chatBox.scrollTop = chatBox.scrollHeight;
      }
    });

    socket.on("angelRupture", function(){
      if(typeof doAngelRuptureEffect === "function"){
          doAngelRuptureEffect();
      }
    });

    socket.on("blossomEvent", function(){
      if(typeof triggerBlossomEffect === "function"){
        triggerBlossomEffect();
      }
    });

    socket.on("eventToggle", function(data) {
      // Removed debug log for production:
      // console.log("Received eventToggle:", data);
      if(data.event === "blossom"){
        window.currentEvent = "blossom";
        window.blossomActive = true;
        window.thunderActive = false;
      } else if(data.event === "thunder"){
        window.currentEvent = "thunder";
        window.thunderActive = true;
        window.blossomActive = false;
      } else if(data.event === "meteor"){
        window.currentEvent = "meteor";
        window.meteorActive = true;
        window.blossomActive = false;
        window.thunderActive = false;
        if (typeof startMeteorEvent === "function") startMeteorEvent();
      } else {
        window.currentEvent = null;
        window.blossomActive = false;
        window.thunderActive = false;
        window.meteorActive = false;
      }
    });

    // NEW: Listen for shutdown events from the server and display the shutdown overlay.
    socket.on("shutdown", function() {
      const shutdownOverlay = document.getElementById("shutdownOverlay");
      if(shutdownOverlay) shutdownOverlay.style.display = "flex";
    });
    
    window.syncPlayer = function () {
      if (window.player && socket.connected) {
        socket.emit("move", {
          x: player.x,
          y: player.y,
          name: player.name,
          color: player.color,
          level: player.level,
          class: player.class,
          angel: !!player.angel,
          inDungeon: (gameState === "dungeon"),
          currentDungeonName: window.currentDungeonName || null, // ADDED
          transformed: player.transformed,
          soldiers: (gameState === "dungeon" ? player.soldiers : []),
          weapon: player.weapon || null,
          facing: player.facing || "right"
        });
      }
    };
  
    window.broadcastEffect = function(x, y, color) {
      if (socket && socket.connected) {
        socket.emit("effect", { x, y, color });
      }
    };
    
    window.broadcastGlobalNotification = function(msg, duration) {
      if (socket && socket.connected) {
        socket.emit("globalNotification", { msg, duration });
      }
    };
    
    // Helper function to draw remote player's weapon, now with facing direction
    function drawRemoteWeapon(p) {
      const ctx = window.ctx;
      let time = Date.now() / 1000;
      let angle = Math.sin(time * ((p.weapon && p.weapon.name === "Dagger") ? 7 : 5)) * 0.05;
      ctx.save();
      // Determine facing direction (default to right if missing)
      let facing = p.facing || "right";
      if (facing === "left") {
        ctx.translate(p.x - 15 - 10, p.y);
        ctx.scale(-1, 1);
      } else {
        ctx.translate(p.x + 15 + 10, p.y);
      }
      ctx.rotate(angle);
      if(p.weapon && p.weapon.name === "Sword"){
        ctx.beginPath();
        ctx.moveTo(0, -14);
        ctx.lineTo(2, -13);
        ctx.lineTo(1, 0);
        ctx.lineTo(-1, 0);
        ctx.lineTo(-2, -13);
        ctx.closePath();
        let bladeGrad = ctx.createLinearGradient(0, -14, 0, 0);
        bladeGrad.addColorStop(0, "#e0e0e0");
        bladeGrad.addColorStop(1, "#a0a0a0");
        ctx.fillStyle = bladeGrad;
        ctx.fill();
        ctx.beginPath();
        ctx.moveTo(-3, 1);
        ctx.lineTo(3, 1);
        ctx.lineTo(2, 3);
        ctx.lineTo(-2, 3);
        ctx.closePath();
        ctx.fillStyle = "#8b4513";
        ctx.fill();
        ctx.fillStyle = "#a0522d";
        ctx.fillRect(-1.5, 3, 3, 10);
        ctx.fillStyle = "#d4af37";
        ctx.beginPath();
        ctx.arc(0, 14, 2, 0, Math.PI * 2);
        ctx.fill();
      } else if(p.weapon && p.weapon.name === "Dagger"){
        ctx.fillStyle = "#d3d3d3";
        ctx.beginPath();
        ctx.moveTo(0, -9);
        ctx.lineTo(2, -3.5);
        ctx.lineTo(1.5, 0);
        ctx.lineTo(-1.5, 0);
        ctx.lineTo(-2, -3.5);
        ctx.closePath();
        ctx.fill();
        ctx.fillStyle = "#555";
        ctx.fillRect(-1, 0, 2, 4);
        ctx.fillStyle = "#ffd700";
        ctx.beginPath();
        ctx.arc(0, 1.5, 1, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    }
    
    // --- CO-OP DUNGEON SYNC & HEALING ---
    // Add dungeon name to syncPlayer payload
    const _origSyncPlayer = window.syncPlayer;
    window.syncPlayer = function () {
      if (window.player && socket.connected) {
        socket.emit("move", {
          x: player.x,
          y: player.y,
          name: player.name,
          color: player.color,
          level: player.level,
          class: player.class,
          angel: !!player.angel,
          inDungeon: (gameState === "dungeon"),
          currentDungeonName: window.currentDungeonName || null, // ADDED
          transformed: player.transformed,
          soldiers: (gameState === "dungeon" ? player.soldiers : []),
          weapon: player.weapon || null,
          facing: player.facing || "right"
        });
      }
    };
  
    // Listen for dungeon state sync from server
    socket.on("dungeonState", function(data) {
      if(window.gameState === "dungeon" && window.currentDungeonName === data.dungeonName) {
        window.currentWave = data.wave;
        window.enemies = data.enemies;
        // Optionally sync other dungeon state here
      }
    });
  
    // Helper: broadcast dungeon effect (heal, etc) to all in dungeon
    window.broadcastDungeonEffect = function(type, payload) {
      if (socket && socket.connected && window.currentDungeonName) {
        socket.emit("dungeonEffect", {
          type,
          payload,
          dungeonName: window.currentDungeonName
        });
      }
    };
    
    // Listen for dungeon effect (heal, etc)
    socket.on("dungeonEffect", function(data) {
      if(window.gameState === "dungeon" && window.currentDungeonName === data.dungeonName) {
        if(data.type === "heal" && typeof selfHeal === "function") {
          // Only heal if not the sender (payload.senderName)
          if(window.player && window.player.name !== data.payload.senderName) {
            selfHeal();
          }
        }
        // Add more effect types as needed
      }
    });
    
    // Patch Healer's healOthers to broadcast heal to all in dungeon
    if(typeof healOthers === 'function') {
      const _origHealOthers = healOthers;
      window.healOthers = function() {
        if(window.player && window.player.class === "Healer") {
          window.broadcastDungeonEffect("heal", { senderName: window.player.name });
        }
        _origHealOthers();
      };
    }
    
    window.drawOtherPlayers = function () {
      const ctx = window.ctx;
      for (const id in otherPlayers) {
        const p = otherPlayers[id];
        // Only show if in same dungeon (or both in lobby)
        if (window.gameState === "dungeon") {
          if (!p.inDungeon || p.currentDungeonName !== window.currentDungeonName) continue;
        } else {
          if (p.inDungeon) continue;
        }
        if (p.muted) continue;
        // Angel remote player drawing
        if (p.class === "Angel" || p.angel) {
          let hoverOffset = Math.sin(Date.now()/500)*5;
          ctx.beginPath();
          ctx.fillStyle = "#fff";
          ctx.arc(p.x, p.y + hoverOffset, 15, 0, Math.PI * 2);
          ctx.fill();
          ctx.strokeStyle = "#fff";
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.moveTo(p.x - 15, p.y + hoverOffset);
          ctx.quadraticCurveTo(p.x - 35, p.y - 5, p.x - 15, p.y - 5);
          ctx.moveTo(p.x + 15, p.y + hoverOffset);
          ctx.quadraticCurveTo(p.x + 35, p.y - 5, p.x + 15, p.y - 5);
          ctx.stroke();
          ctx.fillStyle = "#fff";
          ctx.font = "12px MedievalSharp";
          let angelLabel = p.name + " (Angel)";
          let labelWidth = ctx.measureText(angelLabel).width;
          ctx.fillText(angelLabel, p.x - labelWidth/2, p.y - 20);
          // Draw weapon if Angel remote player has one
          if(p.weapon) drawRemoteWeapon(p);
          continue;
        }
        // Other classes
        if (p.class === "The Goliath") {
          ctx.save();
          ctx.shadowBlur = p.transformed ? 40 : 30;
          ctx.shadowColor = "yellow";
          let size = p.transformed ? 15 * 1.8 : 15;
          ctx.beginPath();
          ctx.arc(p.x, p.y, size, 0, Math.PI * 2);
          ctx.fillStyle = p.color || "#fff";
          ctx.fill();
          ctx.restore();
        } else {
          ctx.beginPath();
          ctx.fillStyle = p.color || "#aaa";
          ctx.arc(p.x, p.y, 15, 0, Math.PI * 2);
          ctx.fill();
        }
        // Draw remote player's weapon if available (now with facing)
        if(p.weapon) {
          drawRemoteWeapon(p);
        }
        ctx.fillStyle = "#fff";
        ctx.font = "12px MedievalSharp";
        let displayName = `${p.name} (LVL ${p.level||1})`;
        let nameWidth = ctx.measureText(displayName).width;
        ctx.fillText(displayName, p.x - nameWidth/2, p.y - 20);
        if (p.class) {
          let classStr = "Class: " + p.class;
          let classWidth = ctx.measureText(classStr).width;
          ctx.fillText(classStr, p.x - classWidth/2, p.y - 8);
        }
        if(["Administrator", "Administrator 2", "Administrator 3"].includes(p.name)){
          ctx.fillStyle = "#ff0000";
          ctx.font = "bold 12px MedievalSharp";
          let staffText = "Staff";
          let staffWidth = ctx.measureText(staffText).width;
          ctx.fillText(staffText, p.x - staffWidth/2, p.y - 30);
        }
        if(p.inDungeon && p.soldiers && Array.isArray(p.soldiers)) {
          p.soldiers.forEach((soldier) => {
            ctx.beginPath();
            ctx.fillStyle = soldier.color || "#aaa";
            ctx.arc(soldier.x, soldier.y, 10, 0, Math.PI * 2);
            ctx.fill();
          });
        }
      }
    };
    
    console.log("Multiplayer initialized successfully.");
  }
  
  if (document.readyState === "complete") {
    setTimeout(initMultiplayer, 200);
  } else {
    window.addEventListener("load", () => setTimeout(initMultiplayer, 200));
  }

  window.addEventListener("beforeunload", function () { // NEW: Disconnect on page unload
    if (window.socket) window.socket.disconnect();
  }); // FIX: Added closing } and );
})(); // FIX: Close the self-invoking function