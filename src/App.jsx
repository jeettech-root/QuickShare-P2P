import React, { useEffect, useState, useRef } from "react";
import io from "socket.io-client";
import Peer from "simple-peer";
import QRCode from "react-qr-code";
import { Buffer } from "buffer";
import "./App.css";

window.Buffer = window.Buffer || Buffer;

const SERVER_URL = 'https://p2p-backend-3vl9.onrender.com'; 
const socket = io.connect(SERVER_URL); 

function App() {
  const [me, setMe] = useState("");
  const [receivingCall, setReceivingCall] = useState(false);
  const [caller, setCaller] = useState("");
  const [callerSignal, setCallerSignal] = useState(null);
  const [callAccepted, setCallAccepted] = useState(false);
  const [idToCall, setIdToCall] = useState("");
  const [name, setName] = useState("");
  const [connectionStatus, setConnectionStatus] = useState("Disconnected");
  
  const [file, setFile] = useState(null);
  const [receivedFile, setReceivedFile] = useState(null);
  const [downloadName, setDownloadName] = useState("");
  const [transferProgress, setProgress] = useState(0);
  const [msg, setMsg] = useState("");
  const [chat, setChat] = useState([]);

  const [theme, setTheme] = useState("dark");
  const [showPrivacy, setShowPrivacy] = useState(false);
  const [showFeedback, setShowFeedback] = useState(false);
  const [feedbackText, setFeedbackText] = useState("");
  const [glitch, setGlitch] = useState(false); 

  const connectionRef = useRef();
  const fileChunksRef = useRef([]); 
  const fileMetaRef = useRef(null); 
  const chatEndRef = useRef(null);

  const toggleTheme = () => setTheme((prev) => (prev === "dark" ? "light" : "dark"));

  const triggerGlitch = () => {
    setGlitch(true);
    setTimeout(() => setGlitch(false), 500); 
  };

  const submitFeedback = () => {
    if(!feedbackText) return;
    socket.emit("sendFeedback", feedbackText);
    alert("Feedback received! We'll look into it.");
    setFeedbackText("");
    setShowFeedback(false);
  };

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const autoCallId = params.get("call");
    if (autoCallId) setIdToCall(autoCallId);

    socket.on("me", (id) => setMe(id));
    socket.on("callUser", (data) => {
      setReceivingCall(true);
      setCaller(data.from);
      setName(data.name);
      setCallerSignal(data.signal);
    });
  }, []);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chat]);

  useEffect(() => {
    const interval = setInterval(() => {
      if (connectionRef.current?.connected && !connectionRef.current?.destroyed) {
         try { connectionRef.current.send("ping"); } catch (e) {}
      }
    }, 4000);
    return () => clearInterval(interval);
  }, [callAccepted]);

  const callUser = (id) => {
    setConnectionStatus("Calling...");
    const peer = new Peer({ initiator: true, trickle: false });
    peer.on("signal", (data) => socket.emit("callUser", { userToCall: id, signalData: data, from: me, name: name }));
    peer.on("connect", () => setConnectionStatus("Connected"));
    peer.on("data", handleDataReceive);
    peer.on("close", () => { setConnectionStatus("Disconnected"); triggerGlitch(); });
    peer.on("error", () => { setConnectionStatus("Error"); triggerGlitch(); });
    socket.on("callAccepted", (signal) => { setCallAccepted(true); peer.signal(signal); });
    connectionRef.current = peer;
  };

  const answerCall = () => {
    setCallAccepted(true);
    setConnectionStatus("Connecting...");
    const peer = new Peer({ initiator: false, trickle: false });
    peer.on("signal", (data) => socket.emit("answerCall", { signal: data, to: caller }));
    peer.on("connect", () => setConnectionStatus("Connected"));
    peer.on("data", handleDataReceive);
    peer.on("close", () => { setConnectionStatus("Disconnected"); triggerGlitch(); });
    peer.on("error", () => { setConnectionStatus("Error"); triggerGlitch(); });
    peer.signal(callerSignal);
    connectionRef.current = peer;
  };

  const handleDataReceive = (data) => {
    let str = "";
    try { str = data.toString(); } catch (e) { str = ""; }
    if (str === "ping") return; 

    if (str.startsWith('{"text":')) {
        const payload = JSON.parse(str);
        setChat((prev) => [...prev, { sender: "peer", text: payload.text }]);
        return;
    }
    if (str === "file-end") {
        const blob = new Blob(fileChunksRef.current, { type: fileMetaRef.current?.type });
        setReceivedFile(URL.createObjectURL(blob));
        setDownloadName(fileMetaRef.current?.name || "download");
        setProgress(100);
        fileChunksRef.current = [];
        return;
    }
    if (str.includes('{"meta":')) {
        const parsed = JSON.parse(str);
        if (parsed.meta) { fileMetaRef.current = parsed.meta; return; }
    }
    fileChunksRef.current.push(data);
  };

  const sendText = () => {
    if (!msg || !connectionRef.current) return;
    try {
        connectionRef.current.send(JSON.stringify({ text: msg }));
        setChat((prev) => [...prev, { sender: "me", text: msg }]);
        setMsg("");
    } catch (err) { triggerGlitch(); alert("Connection lost!"); }
  };

  const sendFile = () => {
    if (!file || !connectionRef.current) return;
    connectionRef.current.send(JSON.stringify({ meta: { name: file.name, type: file.type } }));
    const reader = new FileReader();
    reader.onload = () => {
      const buffer = Buffer.from(reader.result);
      const chunkSize = 16 * 1024; 
      let offset = 0;
      while (offset < buffer.length) {
          connectionRef.current.send(buffer.slice(offset, offset + chunkSize));
          offset += chunkSize;
          setProgress(Math.round((offset / buffer.length) * 100));
      }
      connectionRef.current.send("file-end");
    };
    reader.readAsArrayBuffer(file);
  };

  const currentUrl = window.location.href.split('?')[0]; 
  const magicLink = `${currentUrl}?call=${me}`;

  return (
    <div className="app-wrapper" data-theme={theme}>
      <div className={`container ${glitch ? "glitch-active" : ""}`}>
        
        {/* TOP ICONS SECTION */}
        <div style={{ display: "flex", justifyContent: "space-between", width: "100%", marginBottom: "15px", zIndex: 10 }}>
            <button className="theme-toggle" onClick={() => setShowPrivacy(!showPrivacy)} title="Privacy Policy">
              <span>🛡️</span>
            </button>
            <button className="theme-toggle" onClick={toggleTheme} title="Switch Theme">
              <span>{theme === "dark" ? "☀️" : "🌙"}</span>
            </button>
        </div>

        {/* PRIVACY MODAL */}
        {showPrivacy && (
            <div className="card" style={{border: "2px solid #10b981", animation: "slideUp 0.3s ease", position: "relative", zIndex: 20}}>
                <h3 style={{color: "#10b981", margin:0}}>🔒 Zero-Knowledge</h3>
                <ul style={{textAlign: "left", fontSize: "0.9rem", paddingLeft: 20}}>
                    <li><strong>Direct P2P:</strong> Files never touch servers.</li>
                    <li><strong>No Database:</strong> We store zero logs.</li>
                    <li><strong>RAM Only:</strong> Data vanishes on exit.</li>
                </ul>
                <button className="btn-primary" style={{background: "#10b981", marginTop: 10}} onClick={() => setShowPrivacy(false)}>
                    Close
                </button>
            </div>
        )}

        {/* HEADER */}
        <div className="header">
          <h1>⚡ QuickShare</h1>
          <p>Secure Lab-to-Mobile Transfer</p>
        </div>
        
        {/* STATUS BAR */}
        <div className="status-bar" style={{ 
                background: connectionStatus === "Connected" ? "var(--primary)" : 
                            (connectionStatus === "Error") ? "#ef4444" : "#f59e0b",
                color: "white" 
            }}>
            Status: {connectionStatus}
        </div>

        {/* DISCOVERY RADAR SECTION */}
        {!callAccepted && (
          <div className="card" style={{ overflow: "hidden", paddingTop: "40px", paddingBottom: "40px" }}>
              <h3 style={{ marginBottom: "20px" }}>Discovery Mode</h3>
              <div className="radar-container">
                  <div className="radar-ring"></div>
                  <div className="radar-ring"></div>
                  <div className="radar-ring"></div>
                  <div className="radar-beam"></div>
                  <div className="radar-content">
                      <QRCode 
                          value={magicLink} 
                          size={120} 
                          fgColor={theme === "dark" ? "#1e1b4b" : "#0f172a"}
                      />
                  </div>
              </div>
              <div style={{ marginTop: "30px" }}>
                  <p style={{ fontSize: "0.9rem", color: "var(--text-main)" }}>
                      Device ID: <span style={{ fontWeight: "bold", color: "var(--primary)" }}>{me}</span>
                  </p>
                  <p style={{ fontSize: "0.8rem", opacity: 0.7 }}>Searching for nearby peers...</p>
              </div>
          </div>
        )}

        {/* CONNECT INPUT */}
        {!callAccepted && (
            <div className="card">
                <h3>Connect to Peer</h3>
                <input type="text" placeholder="Enter ID..." value={idToCall} onChange={(e) => setIdToCall(e.target.value)} />
                <button className="btn-primary" onClick={() => callUser(idToCall)}>Connect</button>
            </div>
        )}

        {/* INCOMING CALL */}
        {receivingCall && !callAccepted && (
            <div className="card" style={{border: "2px solid #f59e0b", animation: "slideUp 0.3s ease"}}>
                <h3 style={{color: "#f59e0b"}}>🔔 Incoming Connection...</h3>
                <p>From ID: {caller}</p>
                <button className="btn-primary" onClick={answerCall}>Accept</button>
            </div>
        )}

        {/* TRANSFER UI */}
        {connectionStatus === "Connected" && (
            <>
                <div className="card">
                    <h3>💬 Chat</h3>
                    <div style={{ maxHeight: "150px", overflowY: "auto", marginBottom: "10px", textAlign: "left" }}>
                        {chat.map((c, i) => (
                            <div key={i} style={{ 
                                textAlign: c.sender === "me" ? "right" : "left", 
                                margin: "5px 0"
                            }}>
                                <span style={{
                                    background: c.sender === "me" ? "var(--primary)" : "var(--glass-bg)",
                                    padding: "5px 10px",
                                    borderRadius: "10px",
                                    fontSize: "0.9rem"
                                }}>{c.text}</span>
                            </div>
                        ))}
                        <div ref={chatEndRef} />
                    </div>
                    <div style={{display: "flex", gap: 10}}>
                        <input value={msg} onChange={e => setMsg(e.target.value)} placeholder="Type..." style={{marginTop:0}} />
                        <button className="btn-primary" style={{marginTop: 0, width: "auto"}} onClick={sendText}>Send</button>
                    </div>
                </div>

                {/* FILE TRANSFER SECTION */}
<div className="card">
    <h3>📁 Secure Transfer</h3>
    <div className="file-upload-wrapper">
        <input type="file" onChange={(e) => setFile(e.target.files[0])} style={{
            opacity: 0, position: "absolute", top:0, left:0, width:"100%", height:"100%", cursor:"pointer"
        }} />
        <p style={{margin:0}}>{file ? file.name : "Tap to Select File"}</p>
    </div>

    <button className="btn-primary" onClick={sendFile} disabled={!file}>
        {transferProgress > 0 && transferProgress < 100 ? "Transferring..." : "Send Now"}
    </button>
    
    {/* NEW LIQUID PROGRESS UI */}
    {transferProgress > 0 && (
        <div className={`liquid-container ${transferProgress === 100 ? "liquid-success" : ""}`}>
            <div className="progress-text">
                {transferProgress === 100 ? "✓ Complete" : `${transferProgress}%`}
            </div>
            <div 
                className="liquid-fill" 
                style={{ height: `${transferProgress}%` }}
            ></div>
        </div>
    )}
    
    {receivedFile && (
        <a href={receivedFile} download={downloadName} className="btn-primary" style={{
            display:"block", 
            textDecoration:"none", 
            background:"#10b981", 
            marginTop: 15,
            animation: "slideUp 0.3s ease"
        }}>
            Download Received File
        </a>
    )}
</div>
            </>
        )}

        {/* FEEDBACK TOGGLE */}
        <div style={{textAlign: "center", marginTop: 20}}>
            <button onClick={() => setShowFeedback(!showFeedback)} style={{background:"none", border:"none", color:"var(--text-secondary)", textDecoration:"underline", cursor:"pointer"}}>
                Report a Glitch
            </button>
            {showFeedback && (
                <div className="card" style={{marginTop: 10, animation: "slideUp 0.3s ease"}}>
                    <h3>🐛 Report Issue</h3>
                    <textarea rows={3} placeholder="Describe issue..." value={feedbackText} onChange={e => setFeedbackText(e.target.value)} />
                    <button className="btn-primary" onClick={submitFeedback}>Submit</button>
                </div>
            )}
        </div>

      </div>
    </div>
  );
}

export default App;