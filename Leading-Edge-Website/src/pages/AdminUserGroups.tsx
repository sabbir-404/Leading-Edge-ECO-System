
import React, { useState, useEffect } from 'react';
import { UserGroup } from '../types';
import { api } from '../services/api';
import { PERMISSIONS } from '../utils/permissionUtils';
import { Shield, Plus, Trash2, Save, Users, Check, X } from 'lucide-react';

// Organized permission sections for the UI
const PERMISSION_SECTIONS = [
  {
    title: 'Dashboard',
    permissions: [
      { key: PERMISSIONS.VIEW_DASHBOARD, label: 'View Dashboard', description: 'Access the admin dashboard overview' },
    ]
  },
  {
    title: 'Products',
    permissions: [
      { key: PERMISSIONS.MANAGE_PRODUCTS, label: 'Manage Products', description: 'Create and edit products' },
      { key: PERMISSIONS.DELETE_PRODUCTS, label: 'Delete Products', description: 'Permanently remove products' },
      { key: PERMISSIONS.MANAGE_CATEGORIES, label: 'Manage Categories', description: 'Create, edit, and delete categories' },
    ]
  },
  {
    title: 'Orders & Users',
    permissions: [
      { key: PERMISSIONS.MANAGE_ORDERS, label: 'Manage Orders', description: 'View and update order status' },
      { key: PERMISSIONS.VIEW_USERS, label: 'View Users', description: 'View user list and profiles' },
      { key: PERMISSIONS.MANAGE_USERS, label: 'Manage Users', description: 'Create, edit users and assign roles' },
    ]
  },
  {
    title: 'Content & Marketing',
    permissions: [
      { key: PERMISSIONS.MANAGE_CONTENT, label: 'Manage Content', description: 'Edit pages, homepage, header/footer' },
      { key: PERMISSIONS.MANAGE_PROJECTS, label: 'Manage Projects', description: 'Create and edit portfolio projects' },
      { key: PERMISSIONS.MANAGE_MARKETING, label: 'Manage Marketing', description: 'Send newsletters and campaigns' },
      { key: PERMISSIONS.MANAGE_SHIPPING, label: 'Manage Shipping', description: 'Configure shipping areas and methods' },
    ]
  }
];

const ALL_PERMISSION_KEYS = PERMISSION_SECTIONS.flatMap(s => s.permissions.map(p => p.key));

const AdminUserGroups: React.FC = () => {
  const [groups, setGroups] = useState<UserGroup[]>([]);
  const [selectedGroup, setSelectedGroup] = useState<UserGroup | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  // Form state
  const [formName, setFormName] = useState('');
  const [formDescription, setFormDescription] = useState('');
  const [formPermissions, setFormPermissions] = useState<string[]>([]);

  const loadGroups = async () => {
    try {
      setLoading(true);
      const data = await api.getUserGroups();
      setGroups(data);
    } catch (e: any) {
      console.error('Failed to load groups:', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadGroups(); }, []);

  const selectGroup = (group: UserGroup) => {
    setSelectedGroup(group);
    setFormName(group.name);
    setFormDescription(group.description || '');
    setFormPermissions([...(group.permissions || [])]);
    setShowDeleteConfirm(false);
  };

  const handleNewGroup = () => {
    setSelectedGroup(null);
    setFormName('');
    setFormDescription('');
    setFormPermissions([]);
    setShowDeleteConfirm(false);
  };

  const togglePermission = (key: string) => {
    setFormPermissions(prev =>
      prev.includes(key) ? prev.filter(p => p !== key) : [...prev, key]
    );
  };

  const toggleAllInSection = (sectionPermissions: { key: string }[]) => {
    const keys = sectionPermissions.map(p => p.key);
    const allSelected = keys.every(k => formPermissions.includes(k));
    if (allSelected) {
      setFormPermissions(prev => prev.filter(p => !keys.includes(p)));
    } else {
      setFormPermissions(prev => [...new Set([...prev, ...keys])]);
    }
  };

  const selectAll = () => {
    const allSelected = ALL_PERMISSION_KEYS.every(k => formPermissions.includes(k));
    setFormPermissions(allSelected ? [] : [...ALL_PERMISSION_KEYS]);
  };

  const handleSave = async () => {
    if (!formName.trim()) return alert('Group name is required');
    setSaving(true);
    try {
      const groupData = {
        id: selectedGroup?.id,
        name: formName.trim(),
        description: formDescription.trim(),
        permissions: formPermissions,
      };

      if (selectedGroup) {
        await api.updateUserGroup(groupData);
      } else {
        const result = await api.createUserGroup(groupData);
        groupData.id = result.id;
      }

      await loadGroups();

      // Re-select the saved group
      if (groupData.id) {
        const updated = (await api.getUserGroups()).find((g: UserGroup) => g.id === groupData.id);
        if (updated) selectGroup(updated);
      }
    } catch (e: any) {
      alert('Failed to save: ' + e.message);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!selectedGroup) return;
    setSaving(true);
    try {
      await api.deleteUserGroup(selectedGroup.id);
      setSelectedGroup(null);
      setFormName('');
      setFormDescription('');
      setFormPermissions([]);
      await loadGroups();
    } catch (e: any) {
      alert('Failed to delete: ' + e.message);
    } finally {
      setSaving(false);
      setShowDeleteConfirm(false);
    }
  };

  const permissionCount = formPermissions.length;
  const totalPermissions = ALL_PERMISSION_KEYS.length;

  return (
    <div className="h-[calc(100vh-8rem)] flex gap-6">
      {/* Left Panel - Group List */}
      <div className="w-80 bg-white rounded-xl shadow-sm border border-gray-200 flex flex-col flex-shrink-0">
        <div className="p-4 border-b">
          <div className="flex justify-between items-center mb-2">
            <h2 className="font-bold text-lg flex items-center gap-2">
              <Shield size={20} className="text-accent" /> User Groups
            </h2>
            <button
              onClick={handleNewGroup}
              className="text-accent hover:bg-orange-50 p-2 rounded-lg transition-colors"
              title="Create new group"
            >
              <Plus size={20} />
            </button>
          </div>
          <p className="text-xs text-gray-500">Define permission sets for different user roles</p>
        </div>

        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <div className="p-8 text-center text-gray-400">Loading...</div>
          ) : groups.length === 0 ? (
            <div className="p-8 text-center text-gray-400">
              <Shield size={32} className="mx-auto mb-2 opacity-50" />
              <p className="text-sm">No groups yet</p>
              <p className="text-xs mt-1">Click + to create one</p>
            </div>
          ) : (
            groups.map(group => (
              <div
                key={group.id}
                onClick={() => selectGroup(group)}
                className={`p-4 border-b cursor-pointer hover:bg-gray-50 transition-colors ${
                  selectedGroup?.id === group.id
                    ? 'bg-orange-50 border-l-4 border-l-accent'
                    : ''
                }`}
              >
                <div className="flex justify-between items-start">
                  <div>
                    <h3 className="font-bold text-gray-800">{group.name}</h3>
                    {group.description && (
                      <p className="text-xs text-gray-500 mt-0.5 line-clamp-1">{group.description}</p>
                    )}
                  </div>
                  <div className="flex items-center gap-1 text-xs text-gray-400">
                    <Users size={12} />
                    <span>{group.userCount || 0}</span>
                  </div>
                </div>
                <div className="flex items-center gap-2 mt-2">
                  <span className="text-[10px] bg-accent/10 text-accent px-2 py-0.5 rounded-full font-medium">
                    {(group.permissions || []).length} permissions
                  </span>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Right Panel - Group Details / Editor */}
      <div className="flex-1 bg-white rounded-xl shadow-sm border border-gray-200 overflow-y-auto">
        {selectedGroup || formName !== '' || formPermissions.length > 0 ? (
          <div className="p-8">
            {/* Header */}
            <div className="flex justify-between items-start mb-6 pb-4 border-b">
              <div>
                <h2 className="text-2xl font-bold text-gray-800">
                  {selectedGroup ? 'Edit Group' : 'New Group'}
                </h2>
                <p className="text-sm text-gray-500 mt-1">
                  {selectedGroup
                    ? `Configure permissions for "${selectedGroup.name}"`
                    : 'Set up a new permission group'}
                </p>
              </div>
              <div className="flex gap-2">
                {selectedGroup && (
                  showDeleteConfirm ? (
                    <div className="flex items-center gap-2 bg-red-50 px-3 py-1.5 rounded-lg border border-red-200">
                      <span className="text-xs text-red-600 font-medium">Delete?</span>
                      <button onClick={handleDelete} className="text-red-600 hover:bg-red-100 p-1 rounded" disabled={saving}>
                        <Check size={16} />
                      </button>
                      <button onClick={() => setShowDeleteConfirm(false)} className="text-gray-500 hover:bg-gray-100 p-1 rounded">
                        <X size={16} />
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={() => setShowDeleteConfirm(true)}
                      className="text-red-500 hover:bg-red-50 p-2 rounded-lg transition-colors"
                      title="Delete group"
                    >
                      <Trash2 size={18} />
                    </button>
                  )
                )}
              </div>
            </div>

            {/* Group Info */}
            <div className="grid grid-cols-2 gap-4 mb-8">
              <div>
                <label className="block text-sm font-bold text-gray-700 mb-1">Group Name *</label>
                <input
                  className="w-full border border-gray-300 p-3 rounded-lg focus:ring-2 focus:ring-accent/30 focus:border-accent outline-none transition-all"
                  value={formName}
                  onChange={e => setFormName(e.target.value)}
                  placeholder="e.g., Content Editor"
                />
              </div>
              <div>
                <label className="block text-sm font-bold text-gray-700 mb-1">Description</label>
                <input
                  className="w-full border border-gray-300 p-3 rounded-lg focus:ring-2 focus:ring-accent/30 focus:border-accent outline-none transition-all"
                  value={formDescription}
                  onChange={e => setFormDescription(e.target.value)}
                  placeholder="Brief description of this group's purpose"
                />
              </div>
            </div>

            {/* Permissions Header */}
            <div className="flex justify-between items-center mb-4">
              <h3 className="font-bold text-gray-800 text-lg">
                Permissions
                <span className="text-sm font-normal text-gray-500 ml-2">
                  ({permissionCount}/{totalPermissions} selected)
                </span>
              </h3>
              <button
                onClick={selectAll}
                className="text-xs text-accent hover:text-accent/80 font-medium px-3 py-1.5 rounded-lg hover:bg-orange-50 transition-colors"
              >
                {permissionCount === totalPermissions ? 'Deselect All' : 'Select All'}
              </button>
            </div>

            {/* Permission Progress Bar */}
            <div className="w-full h-1.5 bg-gray-100 rounded-full mb-6 overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-accent to-orange-400 rounded-full transition-all duration-300"
                style={{ width: `${(permissionCount / totalPermissions) * 100}%` }}
              />
            </div>

            {/* Permission Sections */}
            <div className="space-y-6">
              {PERMISSION_SECTIONS.map(section => {
                const sectionKeys = section.permissions.map(p => p.key);
                const selectedInSection = sectionKeys.filter(k => formPermissions.includes(k)).length;
                const allSelected = selectedInSection === sectionKeys.length;

                return (
                  <div key={section.title} className="bg-gray-50 rounded-xl p-5 border border-gray-100">
                    <div className="flex justify-between items-center mb-4">
                      <h4 className="font-bold text-gray-700 text-sm uppercase tracking-wide">
                        {section.title}
                        <span className="text-gray-400 font-normal ml-2">
                          ({selectedInSection}/{sectionKeys.length})
                        </span>
                      </h4>
                      <button
                        onClick={() => toggleAllInSection(section.permissions)}
                        className={`text-xs px-2.5 py-1 rounded-md font-medium transition-colors ${
                          allSelected
                            ? 'bg-accent/10 text-accent'
                            : 'bg-gray-200 text-gray-600 hover:bg-gray-300'
                        }`}
                      >
                        {allSelected ? 'Deselect' : 'Select All'}
                      </button>
                    </div>

                    <div className="grid grid-cols-1 gap-2">
                      {section.permissions.map(perm => {
                        const isChecked = formPermissions.includes(perm.key);
                        return (
                          <label
                            key={perm.key}
                            className={`flex items-start gap-3 p-3 rounded-lg cursor-pointer transition-all ${
                              isChecked
                                ? 'bg-white border border-accent/30 shadow-sm'
                                : 'bg-transparent hover:bg-white border border-transparent'
                            }`}
                          >
                            <div className="pt-0.5">
                              <input
                                type="checkbox"
                                checked={isChecked}
                                onChange={() => togglePermission(perm.key)}
                                className="w-4 h-4 rounded border-gray-300 text-accent focus:ring-accent/30"
                              />
                            </div>
                            <div>
                              <span className="font-medium text-gray-800 text-sm">{perm.label}</span>
                              <p className="text-xs text-gray-500 mt-0.5">{perm.description}</p>
                            </div>
                          </label>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Save Button */}
            <div className="sticky bottom-0 bg-white pt-6 pb-2 mt-8 border-t">
              <button
                onClick={handleSave}
                disabled={saving || !formName.trim()}
                className="w-full bg-accent hover:bg-accent/90 disabled:opacity-50 text-white py-3.5 rounded-xl font-bold flex items-center justify-center gap-2 transition-all shadow-lg shadow-accent/20"
              >
                <Save size={18} />
                {saving ? 'Saving...' : selectedGroup ? 'Update Group' : 'Create Group'}
              </button>
            </div>
          </div>
        ) : (
          <div className="h-full flex flex-col items-center justify-center text-gray-400">
            <Shield size={48} className="mb-4 opacity-30" />
            <p className="font-medium">Select a group or create a new one</p>
            <p className="text-sm mt-1">Groups define which features each user can access</p>
          </div>
        )}
      </div>
    </div>
  );
};

export default AdminUserGroups;
