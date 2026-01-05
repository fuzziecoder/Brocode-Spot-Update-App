import React, { useState, useEffect, useCallback } from 'react';
import { Edit2, Trash2, CheckCircle, XCircle } from 'lucide-react';
import { useAuth } from '../hooks/useAuth';
import { Spot, UserRole, Attendance } from '../types';
import Card from '../components/common/Card';
import Button from '../components/common/Button';
import Modal from '../components/common/Modal';
import Input from '../components/common/Input';
import Textarea from '../components/common/Textarea';
import { spotService, attendanceService } from '../services/database';
import { checkDatabaseSetup, getSetupInstructions } from '../services/dbCheck';


const HistoryPage: React.FC = () => {
    const { profile } = useAuth();
    const [history, setHistory] = useState<Spot[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [editingSpot, setEditingSpot] = useState<Spot | null>(null);
    const [editFormData, setEditFormData] = useState({
        location: '',
        date: '',
        timing: '',
        budget: '',
        description: '',
        feedback: '',
    });
    const [isEditModalOpen, setIsEditModalOpen] = useState(false);
    const [isDeleteConfirmOpen, setIsDeleteConfirmOpen] = useState(false);
    const [spotToDelete, setSpotToDelete] = useState<string | null>(null);
    const [dbSetupError, setDbSetupError] = useState<string | null>(null);
    const [attendances, setAttendances] = useState<Record<string, Attendance | null>>({});
    
    const fetchData = useCallback(async () => {
        if (!profile) return;
        
        setLoading(true);
        setError(null);
        setDbSetupError(null);
        try {
            const data = await spotService.getPastSpots();
            setHistory(data || []);

            // Fetch attendance for each spot
            const attendanceMap: Record<string, Attendance | null> = {};
            for (const spot of data || []) {
                try {
                    const attendance = await attendanceService.getUserAttendance(spot.id, profile.id);
                    attendanceMap[spot.id] = attendance;
                } catch (err) {
                    console.error(`Error fetching attendance for spot ${spot.id}:`, err);
                    attendanceMap[spot.id] = null;
                }
            }
            setAttendances(attendanceMap);
        } catch(err: any) {
            if (err.message?.includes('does not exist') || err.message?.includes('relation')) {
                const setup = await checkDatabaseSetup();
                setDbSetupError(getSetupInstructions(setup.missingTables));
                setError(null);
            } else {
                setError('Failed to fetch spot history: ' + err.message);
            }
        } finally {
            setLoading(false);
        }
    }, [profile]);

    useEffect(() => {
        const checkSetup = async () => {
            const setup = await checkDatabaseSetup();
            if (!setup.isSetup) {
                setDbSetupError(getSetupInstructions(setup.missingTables));
            } else {
                setDbSetupError(null);
            }
        };
        checkSetup();
    }, []);

    useEffect(() => {
        fetchData();
    }, [fetchData]);

    const isAdmin = profile?.role === UserRole.ADMIN;

    const handleEdit = (spot: Spot) => {
        setEditingSpot(spot);
        setEditFormData({
            location: spot.location,
            date: spot.date.split('T')[0],
            timing: spot.timing,
            budget: spot.budget.toString(),
            description: spot.description || '',
            feedback: spot.feedback || '',
        });
        setIsEditModalOpen(true);
    };

    const handleUpdate = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!editingSpot) return;

        try {
            await spotService.updateSpot(editingSpot.id, {
                location: editFormData.location,
                date: editFormData.date,
                timing: editFormData.timing,
                budget: Number(editFormData.budget),
                description: editFormData.description,
                feedback: editFormData.feedback,
                day: new Date(editFormData.date).toLocaleDateString('en-US', { weekday: 'long' }),
            });
            setIsEditModalOpen(false);
            setEditingSpot(null);
            fetchData();
        } catch (err: any) {
            alert('Failed to update spot: ' + err.message);
        }
    };

    const handleDeleteClick = (spotId: string) => {
        setSpotToDelete(spotId);
        setIsDeleteConfirmOpen(true);
    };

    const handleDeleteConfirm = async () => {
        if (!spotToDelete) return;

        try {
            await spotService.deleteSpot(spotToDelete);
            setIsDeleteConfirmOpen(false);
            setSpotToDelete(null);
            fetchData();
        } catch (err: any) {
            alert('Failed to delete spot: ' + err.message);
        }
    };

    const handleAttendance = async (spotId: string, attended: boolean) => {
        if (!profile) return;

        try {
            await attendanceService.upsertAttendance({
                spot_id: spotId,
                user_id: profile.id,
                attended,
            });
            // Update local state
            setAttendances(prev => ({
                ...prev,
                [spotId]: {
                    id: '',
                    spot_id: spotId,
                    user_id: profile.id,
                    attended,
                    created_at: new Date().toISOString(),
                    updated_at: new Date().toISOString(),
                }
            }));
            // Refresh profile to update mission_count
            window.location.reload(); // Simple way to refresh - could be improved
        } catch (err: any) {
            alert('Failed to update attendance: ' + err.message);
        }
    };

    return (
        <div className="space-y-8 pb-20 md:pb-0">
            <h1 className="text-3xl font-bold">Spot History</h1>

            {dbSetupError && (
                <Card className="p-6 bg-red-900/20 border-red-500/50">
                    <div className="space-y-4">
                        <h2 className="text-xl font-bold text-red-400">⚠️ Database Setup Required</h2>
                        <pre className="text-sm text-red-300 whitespace-pre-wrap font-mono bg-black/30 p-4 rounded">
                            {dbSetupError}
                        </pre>
                        <Button
                            onClick={() => window.open('https://supabase.com/dashboard', '_blank')}
                            variant="secondary"
                        >
                            Open Supabase Dashboard
                        </Button>
                    </div>
                </Card>
            )}

            {loading && <div className="text-center p-8">Loading history...</div>}
            {error && !dbSetupError && <div className="text-center p-8 text-red-400">{error}</div>}

            {history.length === 0 ? (
                <Card>
                    <p className="text-center text-gray-400">No past spots to show.</p>
                </Card>
            ) : (
                <div className="space-y-6">
                    {history.map(spot => (
                        <Card key={spot.id}>
                            <div className="flex flex-col md:flex-row justify-between">
                                <div className="flex-1">
                                    <h2 className="text-xl font-bold text-indigo-400">{spot.location}</h2>
                                    <p className="text-gray-300">
                                        {new Date(spot.date).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })} at {spot.timing}
                                    </p>
                                    <p className="text-gray-400 text-sm mt-1">₹{spot.budget} / person</p>
                                </div>
                                {isAdmin && (
                                    <div className="flex gap-2 mt-4 md:mt-0">
                                        <Button 
                                            variant="secondary" 
                                            size="sm"
                                            onClick={() => handleEdit(spot)}
                                        >
                                            <Edit2 className="w-4 h-4 mr-2"/>
                                            Edit
                                        </Button>
                                        <Button 
                                            variant="secondary" 
                                            size="sm"
                                            onClick={() => handleDeleteClick(spot.id)}
                                        >
                                            <Trash2 className="w-4 h-4 mr-2"/>
                                            Delete
                                        </Button>
                                    </div>
                                )}
                            </div>
                            {spot.description && (
                                <div className="mt-4 pt-4 border-t border-zinc-800">
                                    <h3 className="font-semibold text-gray-400 mb-2">Description:</h3>
                                    <p className="text-gray-300">{spot.description}</p>
                                </div>
                            )}
                            <div className="mt-4 pt-4 border-t border-zinc-800">
                                <h3 className="font-semibold text-gray-400 mb-2">Admin Feedback:</h3>
                                {spot.feedback ? (
                                    <p className="text-gray-300 italic">"{spot.feedback}"</p>
                                ) : (
                                    <div className="text-gray-500">
                                        <p>No feedback yet.</p>
                                    </div>
                                )}
                            </div>

                            {/* Attendance Section */}
                            <div className="mt-4 pt-4 border-t border-zinc-800">
                                <h3 className="font-semibold text-gray-400 mb-3">Did you attend this spot?</h3>
                                {attendances[spot.id] ? (
                                    <div className="flex items-center gap-3">
                                        {attendances[spot.id]?.attended ? (
                                            <>
                                                <CheckCircle className="w-5 h-5 text-green-400" />
                                                <span className="text-green-400 font-semibold">You attended this spot</span>
                                            </>
                                        ) : (
                                            <>
                                                <XCircle className="w-5 h-5 text-red-400" />
                                                <span className="text-red-400 font-semibold">You did not attend</span>
                                            </>
                                        )}
                                        <Button
                                            size="sm"
                                            variant="secondary"
                                            onClick={() => handleAttendance(spot.id, !attendances[spot.id]?.attended)}
                                            className="ml-auto"
                                        >
                                            Change
                                        </Button>
                                    </div>
                                ) : (
                                    <div className="flex gap-2">
                                        <Button
                                            size="sm"
                                            onClick={() => handleAttendance(spot.id, true)}
                                            className="flex items-center gap-2"
                                        >
                                            <CheckCircle className="w-4 h-4" />
                                            Yes, I attended
                                        </Button>
                                        <Button
                                            size="sm"
                                            variant="secondary"
                                            onClick={() => handleAttendance(spot.id, false)}
                                            className="flex items-center gap-2"
                                        >
                                            <XCircle className="w-4 h-4" />
                                            No, I didn't attend
                                        </Button>
                                    </div>
                                )}
                            </div>
                        </Card>
                    ))}
                </div>
            )}

            {/* Edit Modal */}
            <Modal
                isOpen={isEditModalOpen}
                onClose={() => {
                    setIsEditModalOpen(false);
                    setEditingSpot(null);
                }}
                title="Edit Spot"
            >
                <form onSubmit={handleUpdate} className="space-y-4">
                    <Input
                        label="Location"
                        value={editFormData.location}
                        onChange={(e) => setEditFormData({ ...editFormData, location: e.target.value })}
                        required
                    />
                    <Input
                        type="date"
                        label="Date"
                        value={editFormData.date}
                        onChange={(e) => setEditFormData({ ...editFormData, date: e.target.value })}
                        required
                    />
                    <Input
                        type="time"
                        label="Time"
                        value={editFormData.timing}
                        onChange={(e) => setEditFormData({ ...editFormData, timing: e.target.value })}
                        required
                    />
                    <Input
                        type="number"
                        label="Budget"
                        value={editFormData.budget}
                        onChange={(e) => setEditFormData({ ...editFormData, budget: e.target.value })}
                        required
                    />
                    <Textarea
                        label="Description"
                        value={editFormData.description}
                        onChange={(e) => setEditFormData({ ...editFormData, description: e.target.value })}
                    />
                    <Textarea
                        label="Admin Feedback"
                        value={editFormData.feedback}
                        onChange={(e) => setEditFormData({ ...editFormData, feedback: e.target.value })}
                    />
                    <div className="flex gap-2">
                        <Button type="submit" className="flex-1">Update Spot</Button>
                        <Button 
                            type="button" 
                            variant="secondary"
                            onClick={() => {
                                setIsEditModalOpen(false);
                                setEditingSpot(null);
                            }}
                        >
                            Cancel
                        </Button>
                    </div>
                </form>
            </Modal>

            {/* Delete Confirmation Modal */}
            <Modal
                isOpen={isDeleteConfirmOpen}
                onClose={() => {
                    setIsDeleteConfirmOpen(false);
                    setSpotToDelete(null);
                }}
                title="Delete Spot"
            >
                <div className="space-y-4">
                    <p className="text-gray-300">
                        Are you sure you want to delete this spot? This action cannot be undone.
                    </p>
                    <div className="flex gap-2">
                        <Button 
                            variant="secondary"
                            onClick={handleDeleteConfirm}
                            className="flex-1"
                        >
                            Delete
                        </Button>
                        <Button 
                            onClick={() => {
                                setIsDeleteConfirmOpen(false);
                                setSpotToDelete(null);
                            }}
                            className="flex-1"
                        >
                            Cancel
                        </Button>
                    </div>
                </div>
            </Modal>
        </div>
    );
};

export default HistoryPage;
