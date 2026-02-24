// This file is deprecated. Please refer to context/ShopContext.tsx for all global state management.
// Keeping this file to prevent build errors if referenced elsewhere, though all references should be updated.
import { ShopProvider, useShop } from './ShopContext';
export const CartProvider = ShopProvider;
export const useCart = useShop;
