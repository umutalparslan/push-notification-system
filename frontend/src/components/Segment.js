// src/pages/Segment.js
import React from 'react';
import { Link, Outlet } from 'react-router-dom';

const Segment = () => {
  return (
    <div>
      <h1>Segment Management</h1>
      <nav>
        <Link to="new">New Segment</Link> | <Link to="list">Segment List</Link>
      </nav>
      <Outlet />
    </div>
  );
};

export default Segment;