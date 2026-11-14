import React from 'react';
import {Text, View} from 'react-native';
import {useTheme} from '../lib/theme';
import {CAPS_MESSAGE} from '../lib/caps-lock';
// 14/11/2026 (Pedro: "em vez de aparecer mudando de lugar o botao, pode aparecer apenas um sinal do lado de onde esta digitando"):
// sinal ⇪ dentro do campo, a direita; nao empurra nada.
export function CapsBadge({right = 10}: {right?: number}) {
  const c = useTheme();
  return <View testID="caps-lock-warning" accessibilityRole="alert" accessibilityLabel={CAPS_MESSAGE} {...({title: CAPS_MESSAGE} as any)} pointerEvents="none"
    style={{position: 'absolute', right, top: 0, bottom: 0, justifyContent: 'center'}}>
    <View style={{height: 20, minWidth: 20, paddingHorizontal: 4, borderRadius: 5, backgroundColor: c.danger + '26', alignItems: 'center', justifyContent: 'center'}}>
      <Text style={{color: c.danger, fontSize: 13, lineHeight: 16, fontWeight: '600'}}>⇪</Text>
    </View>
  </View>;
}
