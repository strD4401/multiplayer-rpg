// import { useEffect, useState } from "react";
// import { io } from "socket.io-client";

// const socket = io("http://localhost:3000");

// const Chat = () => {
//   const [message, setMessage] = useState("");
//   const [messages, setMessages] = useState<{ from: string; message: string }[]>([]);

//   useEffect(() => {
//     socket.on("receiveMessage", (data) => {
//       setMessages((prev) => [...prev, data]);
//     });

//     return () => {
//       socket.off("receiveMessage");
//     };
//   }, []);

//   const sendMessage = () => {
//     if (message.trim()) {
//       socket.emit("sendMessage", { message, to: "all" });
//       setMessage("");
//     }
//   };

//   return (
//     <div>
//       <h3>Chat</h3>
//       <div>
//         {messages.map((msg, index) => (
//           <div key={index}>
//             <b>{msg.from}</b>: {msg.message}
//           </div>
//         ))}
//       </div>
//       <input value={message} onChange={(e) => setMessage(e.target.value)} />
//       <button onClick={sendMessage}>Send</button>
//     </div>
//   );
// };

// export default Chat;
