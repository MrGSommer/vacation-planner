import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Header, EmptyState } from '../../components/common';
import { RootStackParamList } from '../../types/navigation';
import { colors } from '../../utils/theme';

type Props = NativeStackScreenProps<RootStackParamList, 'Map'>;

export const MapScreen: React.FC<Props> = ({ navigation }) => {
  return (
    <View style={styles.container}>
      <Header title="Karte" onBack={() => navigation.goBack()} />
      <EmptyState
        icon="🗺️"
        title="Karte nicht verfügbar"
        message="Die Kartenansicht ist nur in der mobilen App verfügbar."
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
});
