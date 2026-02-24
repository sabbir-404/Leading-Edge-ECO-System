import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Image } from 'react-native';
// import { ShoppingBag, Search, Menu } from 'lucide-react-native'; // Icons later

export default function HomeScreen({ navigation }: any) {
  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Leading Edge</Text>
        {/* Icons would go here */}
      </View>

      <ScrollView style={styles.content}>
        <View style={styles.heroSection}>
          <Text style={styles.heroTitle}>Premium Furniture</Text>
          <Text style={styles.heroSubtitle}>Elevate your living space</Text>
          <TouchableOpacity style={styles.shopButton} onPress={() => navigation.navigate('Catalog')}>
            <Text style={styles.shopButtonText}>Shop Now</Text>
          </TouchableOpacity>
        </View>

        <Text style={styles.sectionTitle}>Featured Categories</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.categoriesList}>
          {['Living Room', 'Bedroom', 'Dining', 'Office'].map((cat, index) => (
             <TouchableOpacity key={index} style={styles.categoryCard}>
                <View style={styles.categoryImagePlaceholder} />
                <Text style={styles.categoryName}>{cat}</Text>
             </TouchableOpacity>
          ))}
        </ScrollView>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0f172a', // Dark theme matching desktop
  },
  header: {
    padding: 20,
    paddingTop: 60,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#1e293b',
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#fbbf24',
  },
  content: {
    flex: 1,
  },
  heroSection: {
    padding: 30,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 200,
    backgroundColor: '#1e293b',
    margin: 20,
    borderRadius: 16,
  },
  heroTitle: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#fff',
    marginBottom: 8,
  },
  heroSubtitle: {
    fontSize: 16,
    color: '#94a3b8',
    marginBottom: 20,
  },
  shopButton: {
    backgroundColor: '#fbbf24',
    paddingVertical: 12,
    paddingHorizontal: 30,
    borderRadius: 8,
  },
  shopButtonText: {
    color: '#0f172a',
    fontWeight: 'bold',
    fontSize: 16,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#e2e8f0',
    marginLeft: 20,
    marginTop: 10,
    marginBottom: 15,
  },
  categoriesList: {
    paddingLeft: 20,
  },
  categoryCard: {
    marginRight: 15,
    width: 120,
  },
  categoryImagePlaceholder: {
    width: 120,
    height: 120,
    backgroundColor: '#334155',
    borderRadius: 12,
    marginBottom: 8,
  },
  categoryName: {
    color: '#cbd5e1',
    textAlign: 'center',
    fontWeight: '500',
  }
});
