import React, { useEffect, useState, useRef } from 'react';
import { 
    View, Text, TextInput, TouchableOpacity, FlatList, 
    StyleSheet, KeyboardAvoidingView, Platform, SafeAreaView,
    ActivityIndicator, Image
} from 'react-native';
import { supabase } from '../../lib/supabase';
import { useTheme } from '../../lib/ThemeContext';
import { decryptField, encryptField } from '../../lib/encryption';
import { Send, Paperclip, ChevronLeft, Phone, Video } from 'lucide-react-native';

export default function ChatRoomScreen({ route, navigation }: any) {
    const { receiver, receiverName } = route.params;
    const { theme } = useTheme();
    const [messages, setMessages] = useState<any[]>([]);
    const [inputText, setInputText] = useState('');
    const [loading, setLoading] = useState(true);
    const [currentUser, setCurrentUser] = useState<any>(null);
    const flatListRef = useRef<FlatList>(null);

    useEffect(() => {
        setupChat();
        
        // Subscribe to new messages
        const channel = supabase
            .channel(`internal_messages:${receiver.id}`)
            .on('postgres_changes', 
                { event: 'INSERT', schema: 'public', table: 'internal_messages' },
                (payload) => {
                    const msg = payload.new;
                    // Only add if it belongs to this conversation
                    if ((msg.sender_id === currentUser?.id && msg.receiver_id === receiver.id) ||
                        (msg.sender_id === receiver.id && msg.receiver_id === currentUser?.id)) {
                        setMessages(current => [...current, msg]);
                        setTimeout(() => flatListRef.current?.scrollToEnd(), 100);
                    }
                }
            )
            .subscribe();

        return () => {
            supabase.removeChannel(channel);
        };
    }, [currentUser, receiver.id]);

    const setupChat = async () => {
        try {
            const { data: { user: authUser } } = await supabase.auth.getUser();
            if (!authUser) return;

            const { data: profile } = await supabase.from('users').select('*').eq('auth_id', authUser.id).single();
            setCurrentUser(profile);

            // Fetch initial messages
            const { data, error } = await supabase.from('internal_messages')
                .select('*')
                .or(`and(sender_id.eq.${profile.id},receiver_id.eq.${receiver.id}),and(sender_id.eq.${receiver.id},receiver_id.eq.${profile.id})`)
                .order('created_at', { ascending: true });

            if (error) throw error;
            setMessages(data || []);
            setLoading(false);
            setTimeout(() => flatListRef.current?.scrollToEnd(), 200);
        } catch (e) {
            console.error(e);
            setLoading(false);
        }
    };

    const sendMessage = async () => {
        if (!inputText.trim() || !currentUser) return;

        const content = inputText.trim();
        setInputText('');

        try {
            // Encrypt on send
            const encryptedContent = encryptField(content);

            const { error } = await supabase.from('internal_messages').insert({
                sender_id: currentUser.id,
                receiver_id: receiver.id,
                content: encryptedContent,
                message_type: 'text'
            });

            if (error) {
                console.error('Send failed:', error);
                // Optionally show error toast
            }
        } catch (e) {
            console.error(e);
        }
    };

    const s = makeStyles(theme);

    const renderMessage = ({ item }: any) => {
        const isMine = item.sender_id === currentUser?.id;
        const decryptedContent = decryptField(item.content);
        
        return (
            <View style={[s.msgWrapper, isMine ? s.myWrapper : s.theirWrapper]}>
                <View style={[s.msgBubble, isMine ? s.myBubble : s.theirBubble]}>
                    <Text style={[s.msgText, isMine ? s.myText : s.theirText]}>
                        {decryptedContent}
                    </Text>
                    <Text style={[s.time, isMine ? s.myTime : s.theirTime]}>
                        {new Date(item.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </Text>
                </View>
            </View>
        );
    };

    return (
        <SafeAreaView style={s.safe}>
            <KeyboardAvoidingView 
                style={s.container}
                behavior={Platform.OS === 'ios' ? 'padding' : undefined}
                keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}
            >
                {/* Custom Header */}
                <View style={[s.header, { justifyContent: 'space-between' }]}>
                    <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                        <TouchableOpacity onPress={() => navigation.goBack()} style={s.backBtn}>
                            <ChevronLeft color={theme.textPrimary} size={24} />
                        </TouchableOpacity>
                        <View style={s.headerInfo}>
                            <Text style={s.headerName}>{receiverName}</Text>
                            <Text style={s.headerStatus}>{receiver.is_online ? 'Online' : 'Offline'}</Text>
                        </View>
                    </View>
                    
                    {currentUser && (
                        <View style={{ flexDirection: 'row', alignItems: 'center', marginRight: 6, gap: 10 }}>
                            <TouchableOpacity
                                style={{ padding: 8, backgroundColor: theme.accent + '22', borderRadius: 20 }}
                                onPress={() => {
                                    supabase.from('notifications').insert({
                                        title: '📞 Incoming Voice Call',
                                        message: `${currentUser.full_name || currentUser.username} is calling you (voice)`,
                                        sender_id: currentUser.id,
                                        recipient_id: receiver.id
                                    });
                                    alert('Voice call invite sent! (Native WebRTC integration requires Android Studio build tools)');
                                }}
                            >
                                <Phone color={theme.accent} size={20} />
                            </TouchableOpacity>
                            <TouchableOpacity
                                style={{ padding: 8, backgroundColor: theme.accent + '22', borderRadius: 20 }}
                                onPress={() => {
                                    supabase.from('notifications').insert({
                                        title: '📹 Incoming Video Call',
                                        message: `${currentUser.full_name || currentUser.username} is calling you (video)`,
                                        sender_id: currentUser.id,
                                        recipient_id: receiver.id
                                    });
                                    alert('Video call invite sent! (Native WebRTC integration requires Android Studio build tools)');
                                }}
                            >
                                <Video color={theme.accent} size={20} />
                            </TouchableOpacity>
                        </View>
                    )}
                </View>

                {loading ? (
                    <View style={s.center}>
                        <ActivityIndicator color={theme.accent} />
                    </View>
                ) : (
                    <FlatList
                        ref={flatListRef}
                        data={messages}
                        keyExtractor={(item, index) => item.id?.toString() || index.toString()}
                        renderItem={renderMessage}
                        contentContainerStyle={s.list}
                        onContentSizeChange={() => flatListRef.current?.scrollToEnd()}
                    />
                )}

                <View style={s.inputContainer}>
                    <TouchableOpacity style={s.attachBtn}>
                        <Paperclip color={theme.textMuted} size={22} />
                    </TouchableOpacity>
                    <TextInput
                        style={s.input}
                        value={inputText}
                        onChangeText={setInputText}
                        placeholder="Type a message..."
                        placeholderTextColor={theme.textMuted}
                        multiline
                    />
                    <TouchableOpacity 
                        style={[s.sendBtn, !inputText.trim() && { opacity: 0.5 }]} 
                        onPress={sendMessage}
                        disabled={!inputText.trim()}
                    >
                        <Send color="#fff" size={20} />
                    </TouchableOpacity>
                </View>
            </KeyboardAvoidingView>
        </SafeAreaView>
    );
}

const makeStyles = (theme: any) => StyleSheet.create({
    safe: { flex: 1, backgroundColor: theme.bg },
    container: { flex: 1 },
    header: { 
        flexDirection: 'row', 
        alignItems: 'center', 
        padding: 12, 
        borderBottomWidth: 1, 
        borderBottomColor: theme.border,
        backgroundColor: theme.bgCard
    },
    backBtn: { padding: 8 },
    headerInfo: { marginLeft: 8 },
    headerName: { color: theme.textPrimary, fontSize: 16, fontWeight: '700' },
    headerStatus: { color: theme.success, fontSize: 11, fontWeight: '600' },
    list: { padding: 16, paddingBottom: 24 },
    msgWrapper: { marginBottom: 12, maxWidth: '80%' },
    myWrapper: { alignSelf: 'flex-end' },
    theirWrapper: { alignSelf: 'flex-start' },
    msgBubble: { padding: 12, borderRadius: 20 },
    myBubble: { backgroundColor: theme.accent, borderBottomRightRadius: 4 },
    theirBubble: { backgroundColor: theme.bgCard, borderBottomLeftRadius: 4, borderWidth: 1, borderColor: theme.border },
    msgText: { fontSize: 15, lineHeight: 20 },
    myText: { color: '#fff' },
    theirText: { color: theme.textPrimary },
    time: { fontSize: 9, marginTop: 4, alignSelf: 'flex-end', opacity: 0.6 },
    myTime: { color: '#ffffff' },
    theirTime: { color: theme.textSecondary },
    inputContainer: { 
        flexDirection: 'row', 
        alignItems: 'center', 
        padding: 12, 
        backgroundColor: theme.bgCard,
        borderTopWidth: 1,
        borderTopColor: theme.border,
        paddingBottom: Platform.OS === 'ios' ? 12 : 12
    },
    attachBtn: { padding: 10 },
    input: { 
        flex: 1, 
        backgroundColor: theme.bgInput, 
        borderRadius: 24, 
        paddingHorizontal: 16, 
        paddingVertical: 8, 
        maxHeight: 100, 
        color: theme.textPrimary,
        marginHorizontal: 8,
        borderWidth: 1,
        borderColor: theme.border
    },
    sendBtn: { 
        backgroundColor: theme.accent, 
        width: 44, 
        height: 44, 
        borderRadius: 22, 
        alignItems: 'center', 
        justifyContent: 'center' 
    },
    center: { flex: 1, alignItems: 'center', justifyContent: 'center' }
});
