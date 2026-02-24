import React from 'react';
import Navbar from '../components/Navbar';
import { useShop } from '../context/ShopContext';
import { Trash2, CreditCard, Lock } from 'lucide-react';
import { CURRENCY } from '../constants';

const Checkout: React.FC = () => {
  const { cart, removeFromCart, cartTotal, showToast } = useShop();
  const shipping = 100;
  const tax = cartTotal * 0.08;
  const finalTotal = cartTotal + shipping + tax;

  const handlePay = () => {
      showToast('Order Placed Successfully!', 'success');
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <Navbar />

      <div className="max-w-7xl mx-auto px-4 py-12">
        <h1 className="text-3xl font-serif font-bold mb-8 text-primary">Checkout</h1>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-12">
          {/* Left: Forms */}
          <div className="lg:col-span-2 space-y-8">
            {/* Shipping Address */}
            <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
              <h2 className="text-xl font-medium mb-6 flex items-center gap-2">
                <span className="bg-primary text-white w-6 h-6 rounded-full flex items-center justify-center text-xs">1</span>
                Shipping Address
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <input type="text" placeholder="First Name" className="border border-gray-200 p-3 rounded-lg focus:outline-none focus:border-primary transition-colors" />
                <input type="text" placeholder="Last Name" className="border border-gray-200 p-3 rounded-lg focus:outline-none focus:border-primary transition-colors" />
                <input type="text" placeholder="Address" className="md:col-span-2 border border-gray-200 p-3 rounded-lg focus:outline-none focus:border-primary transition-colors" />
                <input type="text" placeholder="City" className="border border-gray-200 p-3 rounded-lg focus:outline-none focus:border-primary transition-colors" />
                <div className="grid grid-cols-2 gap-4">
                  <input type="text" placeholder="State" className="border border-gray-200 p-3 rounded-lg focus:outline-none focus:border-primary transition-colors" />
                  <input type="text" placeholder="ZIP" className="border border-gray-200 p-3 rounded-lg focus:outline-none focus:border-primary transition-colors" />
                </div>
              </div>
            </div>

            {/* Payment */}
            <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
              <h2 className="text-xl font-medium mb-6 flex items-center gap-2">
                <span className="bg-primary text-white w-6 h-6 rounded-full flex items-center justify-center text-xs">2</span>
                Payment Method
              </h2>
              <div className="space-y-4">
                <div className="border border-accent/30 bg-accent/5 p-4 rounded-lg flex items-center gap-3">
                  <input type="radio" name="payment" defaultChecked className="text-accent" />
                  <CreditCard size={20} className="text-primary" />
                  <span className="font-medium">Credit Card</span>
                </div>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pl-6">
                  <input type="text" placeholder="Card Number" className="md:col-span-2 border border-gray-200 p-3 rounded-lg focus:outline-none focus:border-primary transition-colors" />
                  <input type="text" placeholder="MM/YY" className="border border-gray-200 p-3 rounded-lg focus:outline-none focus:border-primary transition-colors" />
                  <input type="text" placeholder="CVC" className="border border-gray-200 p-3 rounded-lg focus:outline-none focus:border-primary transition-colors" />
                </div>
              </div>
            </div>

            <button onClick={handlePay} className="w-full bg-primary text-white py-4 rounded-xl font-medium hover:bg-gray-800 transition-all flex items-center justify-center gap-2 shadow-lg">
              <Lock size={18} /> Pay {CURRENCY}{finalTotal.toFixed(2)}
            </button>
          </div>

          {/* Right: Order Summary */}
          <div className="lg:col-span-1">
            <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100 sticky top-24">
              <h3 className="text-lg font-bold mb-6">Order Summary</h3>
              
              <div className="space-y-4 mb-6 max-h-[400px] overflow-y-auto pr-2">
                {cart.length === 0 ? (
                  <p className="text-gray-400 text-center py-8">Your cart is empty.</p>
                ) : (
                  cart.map((item) => (
                    <div key={item.id} className="flex gap-4 items-start">
                      <img src={item.image} alt={item.name} className="w-16 h-16 object-cover rounded-md bg-gray-100" />
                      <div className="flex-1">
                        <h4 className="text-sm font-medium text-primary">{item.name}</h4>
                        <p className="text-xs text-gray-500 mb-1">Qty: {item.quantity}</p>
                        <p className="text-sm font-semibold">{CURRENCY}{item.price}</p>
                      </div>
                      <button 
                        onClick={() => removeFromCart(item.id)}
                        className="text-gray-300 hover:text-red-500 transition-colors"
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  ))
                )}
              </div>

              <div className="space-y-2 border-t border-gray-100 pt-4 text-sm">
                <div className="flex justify-between text-gray-600">
                  <span>Subtotal</span>
                  <span>{CURRENCY}{cartTotal.toFixed(2)}</span>
                </div>
                <div className="flex justify-between text-gray-600">
                  <span>Shipping</span>
                  <span>{CURRENCY}{shipping.toFixed(2)}</span>
                </div>
                <div className="flex justify-between text-gray-600">
                  <span>Tax (8%)</span>
                  <span>{CURRENCY}{tax.toFixed(2)}</span>
                </div>
                <div className="flex justify-between font-bold text-lg pt-2 border-t border-gray-100 mt-2">
                  <span>Total</span>
                  <span>{CURRENCY}{finalTotal.toFixed(2)}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Checkout;