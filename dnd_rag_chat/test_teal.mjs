import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { DiceManager, DiceD6, DiceD20 } from 'threejs-dice-es';

console.log('Testing threejs-dice-es:');
const world = new CANNON.World();
world.gravity.set(0, -9.82 * 20, 0);
DiceManager.setWorld(world);

console.log('World set successfully!');

// Test D6
const d6 = new DiceD6({ size: 1.5, backColor: '#ff0000', fontColor: '#ffffff' });
console.log('D6 created! Values:', d6.values, 'faceTexts:', d6.faceTexts.slice(0, 10));

// Test D20
const d20 = new DiceD20({ size: 1.5, backColor: '#2b1055', fontColor: '#ffd700' });
console.log('D20 created! Values:', d20.values, 'faceTexts:', d20.faceTexts.slice(0, 10));

console.log('All tests passed successfully!');
