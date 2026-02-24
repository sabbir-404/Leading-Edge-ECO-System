import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Check } from 'lucide-react';
import DashboardLayout from '../../components/DashboardLayout';
import '../Accounting/Masters/Masters.css';

interface CompanyForm {
    name: string;
    mailingName: string;
    address: string;
    country: string;
    state: string;
    phone: string;
    email: string;
    financialYearFrom: string;
    booksBeginFrom: string;
    currencySymbol: string;
}

const CreateCompany: React.FC = () => {
    const navigate = useNavigate();
    const [formData, setFormData] = useState<CompanyForm>({
        name: '',
        mailingName: '',
        address: '',
        country: 'Bangladesh',
        state: '',
        phone: '',
        email: '',
        financialYearFrom: '2025-04-01',
        booksBeginFrom: '2025-04-01',
        currencySymbol: '৳',
    });

    const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
        const { name, value } = e.target;
        setFormData(prev => ({ ...prev, [name]: value }));
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        try {
            // @ts-ignore
            await window.electron.createCompany(formData);
            alert('Company Created Successfully!');
            navigate('/dashboard');
        } catch (error) {
            console.error('Error creating company:', error);
            alert('Failed to create company');
        }
    };

    return (
        <DashboardLayout title="Company Creation">
            <div style={{ display: 'flex', justifyContent: 'center', padding: '1rem' }}>
                <form onSubmit={handleSubmit} className="master-create-container" style={{ width: '100%', maxWidth: '800px' }}>
                    <div className="create-form">
                        <div className="section-divider">Directory & Name</div>

                        <div className="form-row" style={{ gridTemplateColumns: '1fr 1fr' }}>
                            <div className="form-group">
                                <label>Company Name</label>
                                <input name="name" value={formData.name} onChange={handleChange} required placeholder="Company name" />
                            </div>
                            <div className="form-group">
                                <label>Mailing Name</label>
                                <input name="mailingName" value={formData.mailingName} onChange={handleChange} placeholder="Optional" />
                            </div>
                        </div>

                        <div className="form-group">
                            <label>Address</label>
                            <textarea name="address" value={formData.address} onChange={handleChange} rows={3} style={{ padding: '0.75rem', borderRadius: '8px', border: '1px solid var(--border-color)', background: 'var(--input-bg)', color: 'var(--text-primary)', fontSize: '1rem', resize: 'vertical' }} />
                        </div>

                        <div className="section-divider">Contact Details</div>

                        <div className="form-row" style={{ gridTemplateColumns: '1fr 1fr' }}>
                            <div className="form-group">
                                <label>Country</label>
                                <select name="country" value={formData.country} onChange={handleChange}>
                                    <option value="Bangladesh">Bangladesh</option>
                                    <option value="India">India</option>
                                    <option value="USA">USA</option>
                                </select>
                            </div>
                            <div className="form-group">
                                <label>State</label>
                                <input name="state" value={formData.state} onChange={handleChange} placeholder="State" />
                            </div>
                            <div className="form-group">
                                <label>Phone</label>
                                <input name="phone" value={formData.phone} onChange={handleChange} placeholder="+880" />
                            </div>
                            <div className="form-group">
                                <label>Email</label>
                                <input name="email" value={formData.email} onChange={handleChange} type="email" placeholder="email@example.com" />
                            </div>
                        </div>

                        <div className="section-divider">Books & Financial Year</div>

                        <div className="form-row" style={{ gridTemplateColumns: '1fr 1fr' }}>
                            <div className="form-group">
                                <label>Financial Year From</label>
                                <input name="financialYearFrom" value={formData.financialYearFrom} onChange={handleChange} type="date" />
                            </div>
                            <div className="form-group">
                                <label>Books Beginning From</label>
                                <input name="booksBeginFrom" value={formData.booksBeginFrom} onChange={handleChange} type="date" />
                            </div>
                        </div>

                        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '1rem', marginTop: '1rem', borderTop: '1px solid var(--border-color)', paddingTop: '1.5rem' }}>
                            <button type="button" onClick={() => navigate('/dashboard')} style={{ background: 'transparent', border: '1px solid #dc2626', color: '#dc2626', padding: '0.6rem 1.2rem', borderRadius: '8px', cursor: 'pointer', fontWeight: 500 }}>
                                Cancel
                            </button>
                            <button type="submit" className="save-btn">
                                <Check size={18} /> Create Company
                            </button>
                        </div>
                    </div>
                </form>
            </div>
        </DashboardLayout>
    );
};

export default CreateCompany;
