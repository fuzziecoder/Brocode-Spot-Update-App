
import React, { useState, useEffect, useRef } from 'react';
import { useAuth } from '../hooks/useAuth';
import { ChatMessage } from '../types';
import { ArrowLeft, Video, Plus, Send, X, Smile, Trash2, Loader2, MoreVertical, Image as ImageIcon } from 'lucide-react';
import { format } from 'date-fns';
import { motion, AnimatePresence } from 'framer-motion';
import * as ReactRouterDOM from 'react-router-dom';
import { useChat } from '../contexts/ChatContext';

const PhotoGallery: React.FC<{ urls: string[] }> = ({ urls }) => {
    if (!urls || urls.length === 0) return null;
    return (
        <div className={`grid gap-1 rounded-xl overflow-hidden max-w-xs ${urls.length === 1 ? 'grid-cols-1' : 'grid-cols-2 aspect-square'}`}>
            {urls.slice(0, 4).map((url, i) => (
                <div key={i} className="relative aspect-square">
                    <img src={url} className="w-full h-full object-cover" alt="Chat attachment" />
                    {urls.length > 4 && i === 3 && (
                        <div className="absolute inset-0 bg-black/60 flex items-center justify-center font-bold text-xs">
                            +{urls.length - 4}
                        </div>
                    )}
                </div>
            ))}
        </div>
    );
};

const ReactionPicker: React.FC<{ onSelect: (e: string) => void }> = ({ onSelect }) => (
    <motion.div 
        initial={{ scale: 0.8, opacity: 0, y: 10 }} 
        animate={{ scale: 1, opacity: 1, y: 0 }} 
        exit={{ scale: 0.8, opacity: 0, y: 10 }}
        className="absolute bottom-full left-0 mb-2 flex bg-[#1A1A1A] p-1.5 rounded-full border border-white/10 shadow-2xl z-30 backdrop-blur-xl"
    >
        {['👍', '❤️', '😂', '🔥', '😮'].map(e => (
            <button 
                key={e} 
                onClick={(ev) => {
                    ev.stopPropagation();
                    onSelect(e);
                }} 
                className="p-1.5 hover:bg-zinc-800 rounded-full transition-colors text-lg"
            >
                {e}
            </button>
        ))}
    </motion.div>
);

const ChatPage: React.FC = () => {
    const { user } = useAuth();
    const navigate = ReactRouterDOM.useNavigate();
    const { messages, loading, sendMessage, addReaction, setChatActive, deleteMessage } = useChat();
    const [newMessage, setNewMessage] = useState('');
    const [imagePreviews, setImagePreviews] = useState<string[]>([]);
    const [reactingTo, setReactingTo] = useState<string | null>(null);
    const [showStickerPicker, setShowStickerPicker] = useState(false);
    const messagesEndRef = useRef<HTMLDivElement>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);

    // Popular emojis/stickers (can be extended)
    const stickers = [
        '😀', '😃', '😄', '😁', '😆', '😅', '😂', '🤣', '😊', '😇',
        '🙂', '🙃', '😉', '😌', '😍', '🥰', '😘', '😗', '😙', '😚',
        '😋', '😛', '😝', '😜', '🤪', '🤨', '🧐', '🤓', '😎', '🤩',
        '🥳', '😏', '😒', '😞', '😔', '😟', '😕', '🙁', '😣', '😖',
        '😫', '😩', '🥺', '😢', '😭', '😤', '😠', '😡', '🤬', '🤯',
        '😳', '🥵', '🥶', '😱', '😨', '😰', '😥', '😓', '🤗', '🤔',
        '🤭', '🤫', '🤥', '😶', '😐', '😑', '😬', '🙄', '😯', '😦',
        '😧', '😮', '😲', '🥱', '😴', '🤤', '😪', '😵', '🤐', '🥴',
        '🤢', '🤮', '🤧', '😷', '🤒', '🤕', '🤑', '🤠', '😈', '👿',
        '👹', '👺', '🤡', '💩', '👻', '💀', '☠️', '👽', '👾', '🤖',
        '🎃', '😺', '😸', '😹', '😻', '😼', '😽', '🙀', '😿', '😾',
        '👋', '🤚', '🖐', '✋', '🖖', '👌', '🤏', '✌️', '🤞', '🤟',
        '🤘', '🤙', '👈', '👉', '👆', '🖕', '👇', '☝️', '👍', '👎',
        '✊', '👊', '🤛', '🤜', '👏', '🙌', '👐', '🤲', '🤝', '🙏',
        '✍️', '💪', '🦾', '🦿', '🦵', '🦶', '👂', '🦻', '👃', '🧠',
        '🦷', '🦴', '👀', '👁️', '👅', '👄', '💋', '💘', '💝', '💖',
        '💗', '💓', '💞', '💕', '💟', '❣️', '💔', '❤️', '🧡', '💛',
        '💚', '💙', '💜', '🖤', '🤍', '🤎', '💯', '💢', '💥', '💫',
        '💦', '💨', '🕳️', '💣', '💬', '👁️‍🗨️', '🗨️', '🗯️', '💭', '💤',
    ];

    useEffect(() => { 
        setChatActive(true); 
        return () => setChatActive(false); 
    }, [setChatActive]);

    useEffect(() => { 
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }); 
    }, [messages]);

    const handleSend = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!newMessage.trim() && imagePreviews.length === 0) return;
        
        try {
            await sendMessage({ 
                content_text: newMessage, 
                content_image_urls: imagePreviews 
            });
            setNewMessage(''); 
            setImagePreviews([]);
        } catch (error) {
            console.error("Failed to send message:", error);
            alert("Failed to send message. Please try again.");
        }
    };

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const files = e.target.files;
        if (files) {
            Array.from(files).forEach(file => {
                const reader = new FileReader();
                reader.onloadend = () => {
                    setImagePreviews(prev => [...prev, reader.result as string]);
                };
                reader.readAsDataURL(file);
            });
        }
    };

    const handleStickerSelect = async (sticker: string) => {
        setShowStickerPicker(false);
        try {
            await sendMessage({ 
                content_text: sticker
            });
        } catch (error) {
            console.error("Failed to send sticker:", error);
            alert("Failed to send sticker. Please try again.");
        }
    };

    return (
        <div className="h-[calc(100vh-140px)] md:h-[calc(100vh-64px)] flex flex-col bg-black text-white relative overflow-hidden rounded-3xl border border-white/5">
            <header className="flex items-center justify-between p-4 border-b border-zinc-800 bg-black/80 backdrop-blur-md sticky top-0 z-20">
                <div className="flex items-center gap-4">
                    <button onClick={() => navigate(-1)} className="p-2 hover:bg-zinc-800 rounded-full transition-colors">
                        <ArrowLeft size={20}/>
                    </button>
                    <div>
                        <h2 className="font-black text-sm uppercase tracking-widest">SQUAD CHAT</h2>
                        <div className="flex items-center gap-1.5">
                            <div className="w-1.5 h-1.5 bg-green-500 rounded-full animate-pulse" />
                            <p className="text-[9px] text-zinc-500 font-bold uppercase tracking-widest">7 Ops Active</p>
                        </div>
                    </div>
                </div>
                <div className="flex items-center gap-2">
                    <button className="p-2 hover:bg-zinc-800 rounded-full text-zinc-400 transition-colors">
                        <Video size={20}/>
                    </button>
                    <button className="p-2 hover:bg-zinc-800 rounded-full text-zinc-400 transition-colors">
                        <MoreVertical size={20}/>
                    </button>
                </div>
            </header>

            <div className="flex-1 overflow-y-auto p-4 space-y-6 custom-scrollbar">
                {loading && (
                    <div className="flex flex-col items-center justify-center h-full gap-4 text-zinc-500">
                        <Loader2 className="animate-spin" size={32}/>
                        <p className="text-[10px] font-black uppercase tracking-[0.2em]">Syncing Encrypted Comms</p>
                    </div>
                )}
                
                <AnimatePresence initial={false}>
                    {messages.map((msg, index) => {
                        const isMe = msg.user_id === user?.id;
                        const showAvatar = !isMe && (index === 0 || messages[index-1].user_id !== msg.user_id);
                        
                        return (
                            <motion.div 
                                key={msg.id} 
                                initial={{ opacity: 0, y: 10, scale: 0.95 }} 
                                animate={{ opacity: 1, y: 0, scale: 1 }} 
                                className={`flex w-full group ${isMe ? 'justify-end' : 'justify-start'}`}
                            >
                                <div className={`flex gap-3 max-w-[85%] ${isMe ? 'flex-row-reverse' : 'flex-row'}`}>
                                    <div 
                                      className="w-8 flex-shrink-0 self-end mb-1 cursor-pointer hover:opacity-80 transition-opacity"
                                      onClick={() => !isMe && (window.location.href = `/dashboard/profile/${msg.user_id}`)}
                                    >
                                        {showAvatar && (
                                            <img 
                                                src={msg.profiles.profile_pic_url || "https://api.dicebear.com/7.x/thumbs/svg?seed=default"} 
                                                className="w-8 h-8 rounded-full border border-white/10" 
                                                alt={msg.profiles.name} 
                                            />
                                        )}
                                    </div>
                                    
                                    <div className="relative flex flex-col space-y-1">
                                        {!isMe && showAvatar && (
                                            <span 
                                              className="text-[10px] font-black text-zinc-500 uppercase tracking-tighter ml-1 cursor-pointer hover:text-zinc-400 transition-colors"
                                              onClick={() => window.location.href = `/dashboard/profile/${msg.user_id}`}
                                            >
                                                {msg.profiles.name}
                                            </span>
                                        )}
                                        
                                        <div className="relative group">
                                            <div className={`p-3.5 rounded-2xl relative overflow-hidden ${
                                                isMe 
                                                ? 'bg-gradient-to-br from-indigo-600 to-indigo-800 text-white rounded-br-none' 
                                                : 'bg-[#1A1A1A] border border-white/5 text-zinc-200 rounded-bl-none'
                                            }`}>
                                                {msg.content_image_urls && msg.content_image_urls.length > 0 && (
                                                    <div className="mb-2"><PhotoGallery urls={msg.content_image_urls}/></div>
                                                )}
                                                {msg.content_text && (
                                                    <p className="text-sm leading-relaxed font-medium">
                                                        {msg.content_text}
                                                    </p>
                                                )}
                                                <span className={`text-[9px] block mt-1.5 font-bold uppercase tracking-widest ${isMe ? 'text-indigo-200' : 'text-zinc-500'}`}>
                                                    {format(new Date(msg.created_at), 'HH:mm')}
                                                </span>
                                            </div>

                                            {/* Action Bar (Hover only) */}
                                            <div className={`absolute top-0 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity ${isMe ? 'right-full mr-2' : 'left-full ml-2'}`}>
                                                <button 
                                                    onClick={() => setReactingTo(reactingTo === msg.id ? null : msg.id)}
                                                    className="p-1.5 hover:bg-zinc-800 rounded-lg text-zinc-500 hover:text-white transition-colors"
                                                >
                                                    <Smile size={14}/>
                                                </button>
                                                {isMe && (
                                                    <button 
                                                        onClick={() => deleteMessage(msg.id)}
                                                        className="p-1.5 hover:bg-red-500/20 rounded-lg text-zinc-500 hover:text-red-400 transition-colors"
                                                    >
                                                        <Trash2 size={14}/>
                                                    </button>
                                                )}
                                            </div>

                                            {/* Reaction Picker Portal */}
                                            <AnimatePresence>
                                                {reactingTo === msg.id && (
                                                    <div className={isMe ? 'right-0' : 'left-0'}>
                                                        <ReactionPicker onSelect={(emoji) => {
                                                            addReaction(msg.id, emoji);
                                                            setReactingTo(null);
                                                        }} />
                                                    </div>
                                                )}
                                            </AnimatePresence>
                                        </div>

                                        {/* Reactions Display */}
                                        {msg.reactions && Object.keys(msg.reactions).length > 0 && (
                                            <div className={`flex flex-wrap gap-1 mt-1 ${isMe ? 'justify-end' : 'justify-start'}`}>
                                                {Object.entries(msg.reactions).map(([emoji, users]) => (
                                                    <button 
                                                        key={emoji}
                                                        onClick={() => addReaction(msg.id, emoji)}
                                                        className={`flex items-center gap-1 px-2 py-0.5 rounded-full border text-[11px] font-bold transition-all ${
                                                            users.includes(user?.id || '') 
                                                            ? 'bg-indigo-500/20 border-indigo-500/40 text-indigo-300' 
                                                            : 'bg-[#1A1A1A] border-white/5 text-zinc-400'
                                                        }`}
                                                    >
                                                        <span>{emoji}</span>
                                                        <span>{users.length}</span>
                                                    </button>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </motion.div>
                        );
                    })}
                </AnimatePresence>
                <div ref={messagesEndRef} />
            </div>

            {/* Input Area */}
            <div className="p-4 bg-black/80 backdrop-blur-xl border-t border-zinc-800">
                <AnimatePresence>
                    {imagePreviews.length > 0 && (
                        <motion.div 
                            initial={{ height: 0, opacity: 0 }} 
                            animate={{ height: 'auto', opacity: 1 }} 
                            exit={{ height: 0, opacity: 0 }}
                            className="flex gap-2 overflow-x-auto pb-4 custom-scrollbar"
                        >
                            {imagePreviews.map((url, i) => (
                                <div key={i} className="relative w-20 h-20 flex-shrink-0">
                                    <img src={url} className="w-full h-full object-cover rounded-xl border border-white/10" alt="Preview" />
                                    <button 
                                        onClick={() => setImagePreviews(prev => prev.filter((_, idx) => idx !== i))}
                                        className="absolute -top-2 -right-2 bg-red-500 p-1 rounded-full text-white shadow-lg"
                                    >
                                        <X size={12}/>
                                    </button>
                                </div>
                            ))}
                        </motion.div>
                    )}
                </AnimatePresence>

                <form onSubmit={handleSend} className="flex items-center gap-3 relative">
                    <button 
                        type="button" 
                        onClick={() => fileInputRef.current?.click()}
                        className="p-3 bg-zinc-900 hover:bg-zinc-800 rounded-2xl text-zinc-400 hover:text-white transition-all border border-white/5"
                    >
                        <Plus size={20}/>
                    </button>
                    <input 
                        type="file" 
                        ref={fileInputRef} 
                        className="hidden" 
                        multiple 
                        accept="image/*" 
                        onChange={handleFileChange} 
                    />
                    
                    <button
                        type="button"
                        onClick={() => setShowStickerPicker(!showStickerPicker)}
                        className={`p-3 rounded-2xl text-zinc-400 hover:text-white transition-all border border-white/5 ${
                            showStickerPicker ? 'bg-indigo-600 text-white' : 'bg-zinc-900 hover:bg-zinc-800'
                        }`}
                    >
                        <Smile size={20}/>
                    </button>

                    {/* Sticker Picker */}
                    {showStickerPicker && (
                        <motion.div
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: 10 }}
                            className="absolute bottom-full left-0 mb-2 w-80 h-64 bg-[#1A1A1A] border border-white/10 rounded-2xl p-4 overflow-y-auto shadow-2xl z-50"
                        >
                            <div className="grid grid-cols-8 gap-2">
                                {stickers.map((sticker, index) => (
                                    <button
                                        key={index}
                                        onClick={() => handleStickerSelect(sticker)}
                                        className="p-2 hover:bg-zinc-800 rounded-lg text-2xl transition-colors"
                                    >
                                        {sticker}
                                    </button>
                                ))}
                            </div>
                        </motion.div>
                    )}
                    
                    <div className="flex-1 relative">
                        <input
                            type="text"
                            value={newMessage}
                            onChange={(e) => setNewMessage(e.target.value)}
                            placeholder="Send a secure message..."
                            className="w-full py-4 pl-5 pr-12 bg-zinc-900/50 border border-white/5 rounded-2xl focus:outline-none focus:border-indigo-500/50 transition-all text-sm placeholder-zinc-600"
                            onFocus={() => setShowStickerPicker(false)}
                        />
                        <button 
                            type="submit"
                            disabled={!newMessage.trim() && imagePreviews.length === 0}
                            className={`absolute right-2 top-1/2 -translate-y-1/2 p-2.5 rounded-xl transition-all ${
                                newMessage.trim() || imagePreviews.length > 0 
                                ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-600/20' 
                                : 'bg-zinc-800 text-zinc-600'
                            }`}
                        >
                            <Send size={18}/>
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
};

export default ChatPage;
