const fs = require('fs');
const path = '/Users/sabbirislam/Desktop/Code/Leading Edge/LE-SOFT/src/pages/Inventory/Masters/PurchaseRequisitions.tsx';
let code = fs.readFileSync(path, 'utf8');

// 1. Add states
code = code.replace('const [showAuditModal, setShowAuditModal] = useState(false);',
`const [showAuditModal, setShowAuditModal] = useState(false);
    const [showEstimatesModal, setShowEstimatesModal] = useState(false);
    const [estimates, setEstimates] = useState([{ supplierId: '', estimatedPrice: '', remarks: '' }]);
    const [directorHistory, setDirectorHistory] = useState<any[]>([]);`);

// 2. Fetch history when director modal opens
code = code.replace('const handleDirectorReview = async (nextStatus: \\'APPROVED\\' | \\'REJECTED\\') => {',
`const openDirectorModal = async (req: PurchaseRequisition) => {
        setSelectedRequisition(req);
        setShowDirectorModal(true);
        try {
            const hist = await (window as any).electron?.getProductPurchaseHistory?.(req.product_id);
            setDirectorHistory(hist || []);
        } catch (e) {
            console.error(e);
        }
    };
    const handleDirectorReview = async (nextStatus: 'APPROVED' | 'REJECTED') => {`);

// 3. Add submit estimates handler
code = code.replace('const handleAuditReview = async (nextStatus: \\'APPROVED\\' | \\'REJECTED\\') => {',
`const handleSubmitEstimates = async () => {
        if (!selectedRequisition) return;
        try {
            const result = await (window as any).electron?.submitPurchaseEstimates?.(
                selectedRequisition.id,
                estimates
            );
            if (result?.success) {
                setShowEstimatesModal(false);
                setEstimates([{ supplierId: '', estimatedPrice: '', remarks: '' }]);
                setSelectedRequisition(null);
                fetchData();
            }
        } catch (error) {
            console.error('Error submitting estimates:', error);
        }
    };

    const handleAuditReview = async (nextStatus: 'APPROVED' | 'REJECTED') => {`);

// 4. Update the actions column in the table
code = code.replace(/<td className="actions">[\s\S]*?<\/td>/,
`<td className="actions">
                                                    {req.status === 'DRAFT' && (
                                                        <>
                                                            <button className="action-btn edit" title="Edit" onClick={() => setTab('create')}><Edit2 size={16} /></button>
                                                            <button className="action-btn delete" title="Delete" onClick={() => handleDelete(req.id)}><Trash2 size={16} /></button>
                                                            <button className="action-btn approve" title="Approve" onClick={() => { setSelectedRequisition(req); setShowApprovalModal(true); }}><Check size={16} /></button>
                                                        </>
                                                    )}
                                                    {req.status === 'PENDING_ESTIMATE' && (
                                                        <button className="action-btn" title="Add Estimates" onClick={() => { setSelectedRequisition(req); setShowEstimatesModal(true); }}><FileText size={16} /></button>
                                                    )}
                                                    {req.status === 'PENDING_AUDIT' && (
                                                        <button className="action-btn approve" title="Audit Review" onClick={() => { setSelectedRequisition(req); setShowAuditModal(true); }}><AlertCircle size={16} /></button>
                                                    )}
                                                    {req.status === 'PENDING_DIRECTOR' && (
                                                        <button className="action-btn approve" title="Director Review" onClick={() => openDirectorModal(req)}><Check size={16} /></button>
                                                    )}
                                                    {req.status === 'APPROVED' && (
                                                        <>
                                                            <button className="action-btn print" title="Print Document" onClick={() => alert('Printing Document...')}><FileText size={16} /></button>
                                                            <button className="action-btn purchase" title="Purchase" onClick={() => { setSelectedRequisition(req); setShowPurchaseModal(true); }}><ShoppingCart size={16} /></button>
                                                        </>
                                                    )}
                                                    {req.status === 'PURCHASED' && (
                                                        <button className="action-btn receive" title="Receive" onClick={() => handleReceive(req.id)}><Package size={16} /></button>
                                                    )}
                                                    {req.status === 'RECEIVED' && (
                                                        <button className="action-btn complete" title="Complete" onClick={() => handleComplete(req.id)}><Check size={16} /></button>
                                                    )}
                                                    <button className="action-btn" title="History" onClick={() => openHistory(req)}><Clock size={16} /></button>
                                                </td>`);

fs.writeFileSync(path, code);
console.log('done modifying main sections');
