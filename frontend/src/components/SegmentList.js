// src/pages/SegmentList.js
import React, { useState, useEffect } from 'react';
import axios from 'axios';

const SegmentList = () => {
  const [segments, setSegments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [editingSegment, setEditingSegment] = useState(null);

  const fetchSegments = async () => {
    try {
      const token = localStorage.getItem('token');
      const response = await axios.get('http://localhost:3000/api/segments', {
        headers: { Authorization: `Bearer ${token}` },
      });
      setSegments(response.data);
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to fetch segments');
    } finally {
      setLoading(false);
    }
  };

  const handleEdit = (segment) => {
    setEditingSegment(segment);
  };

  const handleUpdate = async (e) => {
    e.preventDefault();
    try {
      const token = localStorage.getItem('token');
      await axios.put(
        `http://localhost:3000/api/segments/${editingSegment.id}`,
        editingSegment,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      setEditingSegment(null);
      fetchSegments();
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to update segment');
    }
  };

  const handleDelete = async (id) => {
    try {
      const token = localStorage.getItem('token');
      await axios.delete(`http://localhost:3000/api/segments/${id}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      fetchSegments();
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to delete segment');
    }
  };

  useEffect(() => {
    fetchSegments();
  }, []);

  if (loading) return <div>Loading...</div>;
  if (error) return <div>Error: {error}</div>;

  return (
    <div>
      <h2>Segment List</h2>
      {editingSegment ? (
        <form onSubmit={handleUpdate}>
          <div>
            <label>Name:</label>
            <input
              type="text"
              value={editingSegment.name}
              onChange={(e) => setEditingSegment({ ...editingSegment, name: e.target.value })}
              required
            />
          </div>
          <div>
            <label>Description:</label>
            <textarea
              value={editingSegment.description || ''}
              onChange={(e) => setEditingSegment({ ...editingSegment, description: e.target.value })}
            />
          </div>
          <div>
            <label>Age Filter:</label>
            <input
              type="text"
              value={editingSegment.segment_query.age || ''}
              onChange={(e) =>
                setEditingSegment({
                  ...editingSegment,
                  segment_query: { ...editingSegment.segment_query, age: e.target.value },
                })
              }
            />
          </div>
          <div>
            <label>Location:</label>
            <input
              type="text"
              value={editingSegment.segment_query.location || ''}
              onChange={(e) =>
                setEditingSegment({
                  ...editingSegment,
                  segment_query: { ...editingSegment.segment_query, location: e.target.value },
                })
              }
            />
          </div>
          <button type="submit">Update Segment</button>
          <button type="button" onClick={() => setEditingSegment(null)}>Cancel</button>
        </form>
      ) : (
        <ul>
          {segments.map((segment) => (
            <li key={segment.id}>
              <strong>{segment.name}</strong> - {segment.description || 'No description'} <br />
              Query: {JSON.stringify(segment.segment_query)} <br />
              <button onClick={() => handleEdit(segment)}>Edit</button>
              <button onClick={() => handleDelete(segment.id)}>Delete</button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};

export default SegmentList;