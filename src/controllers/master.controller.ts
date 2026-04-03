import { Request, Response } from "express";
import { MasterToken, UserSignupBody } from "../types";
import jwt from "jsonwebtoken";
import User from "../models/user.model";
import bcrypt from "bcryptjs";
import generateTokenAndSetCookie from "../utils/generateTokenAndSetCookie";
import client from "../redis/client";
import Role from "../models/role.model";
import sendEmail from "../utils/resendUtils";
import { getAccountCreatedTemplate } from "../templates/accountCreated.template";

export const getToken = async (req: Request, res: Response) => {
	try {
		const { password }: MasterToken = req.body;
		const masterPassword = process.env.MASTER_PASSWORD!;

		if (!password || password !== masterPassword) {
			res.status(401).json({ error: "Invalid Admin Credentials" });
			return;
		}

		const payload = {
			masterPassword,
		};

		const token = jwt.sign(payload, process.env.JWT_SECRET!, { expiresIn: "5h" });
		res.status(200).json(token);
	} catch (error) {
		console.log("Error in getting Admin Token", error);
		res.status(500).json({ error: "Internal Server error" });
	}
}

export const addAdmin = async (req: Request, res: Response) => {
	try {
		const {
			name,
			email,
			password,
			mobileNo,
			gender,
			addressLine1,
			addressLine2,
			VTC,
			district,
			state,
			country,
			pincode
		}: UserSignupBody = req.body;

		if (!addressLine1 || !VTC || !district || !state || !country || !pincode || !name || !email || !password || !mobileNo || !gender) {
			res.status(400).json({ error: "All fields are required" });
			return;
		}
		if (password.length < 6) {
			res.status(400).json({ error: "Password should be at least 6 characters long" });
			return;
		}
		if (name.length < 2) {
			res.status(400).json({ error: "Name should be at least 2 characters long" });
			return;
		}
		if (mobileNo.length !== 10) {
			res.status(400).json({ error: "Enter a valid Mobile Number" });
			return;
		}
		if (gender !== "M" && gender !== "F" && gender !== "O") {
			res.status(400).json({ error: "Enter a gender" });
			return;
		}

		const sameUser = await User.findOne({ $or: [{ email }, { mobileNo }] });
		if (sameUser) {
			res.status(400).json({
				error: sameUser.mobileNo === mobileNo ? "A user with this mobile no. already exists. Use another mobile no., or try logging into your account." : "A user with this Email. already exists. Use another Email., or try logging into your account."
			});
			return;
		}

		const role = await Role.findOne({ name: "admin" });
		if (!role) {
			res.status(400).json({ error: "Error in fetching Admin role" });
			return;
		}

		const salt = await bcrypt.genSalt(12);
		const passwordHash = await bcrypt.hash(password, salt);

		const newUser = new User({
			role: role._id,
			name,
			email,
			password: passwordHash,
			mobileNo,
			gender,
			address: {
				addressLine1,
				addressLine2,
				VTC,
				district,
				state,
				country,
				pincode
			}
		});

		if (newUser) {
			await newUser.save();

			const token = generateTokenAndSetCookie(newUser._id, res);
			const payload = {
				token,
				_id: newUser._id,
				role,
				name: newUser.name,
				email: newUser.email,
				mobileNo: newUser.mobileNo,
				gender: newUser.gender
			}

			await client.set(`ZN-user:${newUser._id}`, JSON.stringify(payload));
			await client.expire(`ZN-user:${newUser._id}`, 30 * 24 * 60 * 60);

			const emailHtml = getAccountCreatedTemplate(newUser.name, email, password);
			sendEmail({
				to: email,
				subject: "Welcome to Zorvyn Finance Management - Account Credentials",
				html: emailHtml
			}).catch(err => console.error(`Failed to send setup email to ${email}:`, err));

			res.status(201)
				.header("Authorization", `Bearer ${token}`)
				.json({
					_id: newUser._id,
					role: role.name,
					name: newUser.name,
					email: newUser.email,
					mobileNo: newUser.mobileNo,
					gender: newUser.gender,
					address: newUser.address,
					token
				});
		}
	} catch (error) {
		console.log("Error in addAdmi controller", error);
		res.status(500).json({ error: "Internal Server error" });
	}
}