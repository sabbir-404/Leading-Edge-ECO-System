import React from 'react';
import { Link } from 'react-router-dom';
import { Facebook, Instagram, Twitter, Youtube, MapPin, Mail, Phone, Lock } from 'lucide-react';
import { useShop } from '../context/ShopContext';

const Footer: React.FC = () => {
  const { siteConfig } = useShop();
  const config = siteConfig.headerFooter || {
      logoUrl: '',
      phone: 'N/A',
      email: 'contact@store.com',
      address: 'Address not set',
      facebookUrl: '#',
      instagramUrl: '#',
      twitterUrl: '#',
      youtubeUrl: '#',
      copyrightText: '© 2024 Store. All rights reserved.'
  };

  return (
    <footer className="bg-primary text-white pt-16 pb-8">
      {/* Newsletter Section - Top of Footer */}
      <div className="max-w-7xl mx-auto px-4 mb-16">
        <div className="bg-white/5 rounded-2xl p-8 md:p-12 flex flex-col md:flex-row items-center justify-between gap-8">
          <div className="text-center md:text-left">
            <h3 className="text-2xl font-serif font-bold mb-2">Join the Leading Edge</h3>
            <p className="text-gray-400">Subscribe for exclusive offers and design inspiration.</p>
          </div>
          <div className="flex w-full md:w-auto max-w-md">
            <input 
              type="email" 
              placeholder="Your email address" 
              className="bg-white text-primary px-4 py-3 rounded-l-lg w-full focus:outline-none"
            />
            <button className="bg-accent hover:bg-orange-600 text-white px-6 py-3 font-medium rounded-r-lg transition-colors whitespace-nowrap">
              Sign Up
            </button>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-12 border-b border-gray-800 pb-12">
        {/* Brand & Social */}
        <div>
          <h2 className="text-3xl font-bold tracking-tighter mb-6">
            LE<span className="text-accent">A</span>DING<br/>EDGE
          </h2>
          <p className="text-gray-400 text-sm leading-relaxed mb-6">
            Defining modern living with artistic furniture and sustainable design. Quality craftsmanship for the visionary home.
          </p>
          <div className="flex gap-4">
            {config.facebookUrl && (
                <a href={config.facebookUrl} className="w-10 h-10 rounded-full bg-white/10 flex items-center justify-center hover:bg-accent transition-colors">
                <Facebook size={18} />
                </a>
            )}
            {config.instagramUrl && (
                <a href={config.instagramUrl} className="w-10 h-10 rounded-full bg-white/10 flex items-center justify-center hover:bg-accent transition-colors">
                <Instagram size={18} />
                </a>
            )}
            {config.twitterUrl && (
                <a href={config.twitterUrl} className="w-10 h-10 rounded-full bg-white/10 flex items-center justify-center hover:bg-accent transition-colors">
                <Twitter size={18} />
                </a>
            )}
            {config.youtubeUrl && (
                <a href={config.youtubeUrl} className="w-10 h-10 rounded-full bg-white/10 flex items-center justify-center hover:bg-accent transition-colors">
                <Youtube size={18} />
                </a>
            )}
          </div>
        </div>

        {/* Quick Links */}
        <div>
          <h4 className="font-bold text-lg mb-6">Company</h4>
          <ul className="space-y-3 text-gray-400 text-sm">
            <li><Link to="/about" className="hover:text-accent transition-colors">About Us</Link></li>
            <li><Link to="/shipping" className="hover:text-accent transition-colors">Shipping Policy</Link></li>
            <li><Link to="/returns" className="hover:text-accent transition-colors">Exchange & Returns</Link></li>
            <li><Link to="/" className="hover:text-accent transition-colors">Privacy Policy</Link></li>
            <li><Link to="/" className="hover:text-accent transition-colors">Terms of Service</Link></li>
          </ul>
        </div>

        {/* Contact Info */}
        <div>
          <h4 className="font-bold text-lg mb-6">Contact Us</h4>
          <ul className="space-y-4 text-gray-400 text-sm">
            <li className="flex items-start gap-3">
              <MapPin size={18} className="text-accent mt-0.5 flex-shrink-0" />
              <span>{config.address}</span>
            </li>
            <li className="flex items-center gap-3">
              <Phone size={18} className="text-accent flex-shrink-0" />
              <span>{config.phone}</span>
            </li>
            <li className="flex items-center gap-3">
              <Mail size={18} className="text-accent flex-shrink-0" />
              <span>{config.email}</span>
            </li>
          </ul>
        </div>

        {/* Map */}
        <div className="h-full min-h-[200px] rounded-lg overflow-hidden bg-gray-800">
          <iframe 
            src="https://www.google.com/maps/embed?pb=!1m18!1m12!1m3!1d3022.1422937950147!2d-73.98731968482413!3d40.75889497932681!2m3!1f0!2f0!3f0!3m2!1i1024!2i768!4f13.1!3m3!1m2!1s0x89c25855c6480299%3A0x55194ec5a1ae072e!2sTimes%20Square!5e0!3m2!1sen!2sus!4v1620000000000!5m2!1sen!2sus" 
            width="100%" 
            height="100%" 
            style={{ border: 0 }} 
            allowFullScreen={false} 
            loading="lazy"
            title="Shop Location"
          ></iframe>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 pt-8 text-center text-gray-500 text-sm flex justify-center items-center gap-2">
        <p>{config.copyrightText}</p>
        {/* Secret Admin Link */}
        <Link to="/admin" className="text-gray-800 hover:text-gray-700 transition-colors"><Lock size={12} /></Link>
      </div>
    </footer>
  );
};

export default Footer;