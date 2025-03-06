// src/pages/NewSegment.js
import React, { useState } from 'react';
import axios from 'axios';

const NewSegment = () => {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [segmentQuery, setSegmentQuery] = useState({ age: '', location: '' });
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);

  const handleSubmit = async (e) => {
    e.preventDefault();
    const token = localStorage.getItem('token');

    try {
      const response = await axios.post(
        'http://localhost:3000/api/segments',
        { name, description, segment_query: segmentQuery },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      setSuccess('Segment created successfully!');
      setError(null);
      setName('');
      setDescription('');
      setSegmentQuery({ age: '', location: '' });
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to create segment');
      setSuccess(null);
    }
  };

  return (
    <div>
      <h2>Create New Segment</h2>
      {error && <p style={{ color: 'red' }}>{error}</p>}
      {success && <p style={{ color: 'green' }}>{success}</p>}
      <form onSubmit={handleSubmit}>
        <div>
          <label>Name:</label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
          />
        </div>
        <div>
          <label>Description:</label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
        </div>
        <div>
          <label>Age Filter (e.g., "&gt;25", "25-35", "30"):</label>
          <input
            type="text"
            value={segmentQuery.age}
            onChange={(e) => setSegmentQuery({ ...segmentQuery, age: e.target.value })}
          />
        </div>
        <div>
          <label>Location (e.g., "Istanbul"):</label>
          <input
            type="text"
            value={segmentQuery.location}
            onChange={(e) => setSegmentQuery({ ...segmentQuery, location: e.target.value })}
          />
        </div>
        <button type="submit">Create Segment</button>
      </form>
    </div>
  );
};

export default NewSegment;