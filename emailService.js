const nodemailer = require('nodemailer');

// Create transporter
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS
  }
});

// Send email notification to owner
async function sendMessageNotification(ownerEmail, itemName, message, itemCode) {
  const mailOptions = {
    from: process.env.EMAIL_USER,
    to: ownerEmail,
    subject: `New message about your item: ${itemName}`,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #4CAF50;">Someone Found Your Item!</h2>
        <p>Good news! Someone has found your item and sent you a message.</p>
        
        <div style="background-color: #f5f5f5; padding: 15px; border-radius: 5px; margin: 20px 0;">
          <strong>Item:</strong> ${itemName}<br>
          <strong>Code:</strong> ${itemCode}
        </div>
        
        <div style="background-color: #e3f2fd; padding: 15px; border-radius: 5px; margin: 20px 0;">
          <strong>Message:</strong><br>
          ${message}
        </div>
        
        <p>
          <a href="${process.env.BASE_URL}/dashboard" 
             style="background-color: #4CAF50; color: white; padding: 12px 24px; 
                    text-decoration: none; border-radius: 5px; display: inline-block;">
            Reply to Finder
          </a>
        </p>
        
        <p style="color: #666; font-size: 12px; margin-top: 20px;">
          You can reply to this message from your dashboard. Your contact information remains private.
        </p>
      </div>
    `
  };

  try {
    await transporter.sendMail(mailOptions);
    console.log('Email sent successfully');
    return true;
  } catch (error) {
    console.error('Error sending email:', error);
    return false;
  }
}

// Send reply notification to finder (if they provided email in message)
async function sendReplyNotification(finderEmail, itemName, reply) {
  if (!finderEmail || !finderEmail.includes('@')) {
    return false; // Skip if no valid email
  }

  const mailOptions = {
    from: process.env.EMAIL_USER,
    to: finderEmail,
    subject: `Reply from owner of ${itemName}`,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #2196F3;">The Owner Has Replied!</h2>
        <p>The owner of <strong>${itemName}</strong> has sent you a reply:</p>
        
        <div style="background-color: #e3f2fd; padding: 15px; border-radius: 5px; margin: 20px 0;">
          ${reply}
        </div>
        
        <p style="color: #666; font-size: 12px; margin-top: 20px;">
          This is an automated message. The owner's contact information remains private.
        </p>
      </div>
    `
  };

  try {
    await transporter.sendMail(mailOptions);
    return true;
  } catch (error) {
    console.error('Error sending reply email:', error);
    return false;
  }
}

module.exports = { sendMessageNotification, sendReplyNotification };
