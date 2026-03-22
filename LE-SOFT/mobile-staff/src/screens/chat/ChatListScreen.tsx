import React, { useEffect, useState } from 'react';
import { View, Text, FlatList, TouchableOpacity, StyleSheet, Image, ActivityIndicator } from 'react-native';
import { supabase } from '../../lib/supabase';
import { useTheme } from '../../lib/ThemeContext';
import { decryptField } from '../../lib/encryption';
import { Search, User, MessageCircle } from 'lucide-react-native';
import KeyboardAwareContainer from '../../components/KeyboardAwareContainer';

export default function ChatListScreen({ navigation }: any) {
    const { theme } = useTheme();
    const [users, setUsers] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [currentUser, setCurrentUser] = useState<any>(null);

    useEffect(() => {
        fetchUsers();
    }, []);

    const fetchUsers = async () => {
        setLoading(true);
        try {
            const { data: { user: authUser } } = await supabase.auth.getUser();
            if (!authUser) return;

            // Get current user profile
            const { data: profile } = await supabase.from('users').select('*').eq('auth_id', authUser.id).single();
            setCurrentUser(profile);

            // Get all other active users
            const { data, error } = await supabase.from('users')
                .select('*')
                .eq('is_active', true)
                .neq('id', profile.id)
                .order('full_name');

            if (error) throw error;
            setUsers(data || []);
        } catch (e) {
            console.error(e);
        } finally {
            setLoading(false);
        }
    };

    const s = makeStyles(theme);

    const renderItem = ({ item }: any) => {
        const name = decryptField(item.full_name) || item.username;
        const initials = name.substring(0, 2).toUpperCase();

        return (
            <TouchableOpacity 
                style={s.item} 
                onPress={() => navigation.navigate('ChatRoom', { receiver: item, receiverName: name })}
            >
                <View style={[s.avatar, { backgroundColor: theme.accent + '22' }]}>
                    <Text style={s.avatarText}>{initials}</Text>
                    {item.is_online && <View style={s.onlineBadge} />}
                </View>
                <View style={s.info}>
                    <Text style={s.name}>{name}</Text>
                    <Text style={s.role}>{item.role?.toUpperCase()}</Text>
                </View>
                <MessageCircle color={theme.accent} size={20} opacity={0.6} />
            </TouchableOpacity>
        );
    };

    return (
        <View style={s.container}>
            <View style={s.header}>
                <Text style={s.title}>Staff Chat</Text>
            </View>

            {loading ? (
                <View style={s.center}>
                    <ActivityIndicator color={theme.accent} />
                </View>
            ) : (
                <FlatList
                    data={users}
                    keyExtractor={(item) => item.id.toString()}
                    renderItem={renderItem}
                    contentContainerStyle={s.list}
                    ListEmptyComponent={
                        <View style={s.empty}>
                            <Text style={{color: theme.textMuted}}>No other staff members found.</Text>
                        </View>
                    }
                />
            )}
        </View>
    );
}

const makeStyles = (theme: any) => StyleSheet.create({
    container: { flex: 1, backgroundColor: theme.bg },
    header: { padding: 20, borderBottomWidth: 1, borderBottomColor: theme.border },
    title: { color: theme.textPrimary, fontSize: 24, fontWeight: '800' },
    list: { padding: 16 },
    item: { 
        flexDirection: 'row', 
        alignItems: 'center', 
        backgroundColor: theme.bgCard, 
        padding: 14, 
        borderRadius: 16, 
        marginBottom: 12,
        borderWidth: 1,
        borderColor: theme.border
    },
    avatar: { width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center', marginRight: 14, position: 'relative' },
    avatarText: { color: theme.accent, fontWeight: '700', fontSize: 16 },
    onlineBadge: { 
        position: 'absolute', 
        bottom: 2, 
        right: 2, 
        width: 12, 
        height: 12, 
        borderRadius: 6, 
        backgroundColor: theme.success, 
        borderWidth: 2, 
        borderColor: theme.bgCard 
    },
    info: { flex: 1 },
    name: { color: theme.textPrimary, fontSize: 16, fontWeight: '700' },
    role: { color: theme.textMuted, fontSize: 11, fontWeight: '600', marginTop: 2 },
    center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
    empty: { padding: 40, alignItems: 'center' }
});
