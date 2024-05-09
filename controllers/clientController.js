const mongoose = require('mongoose');

const Client = require("../models/clientModel");
const Advisor = require("../models/advisorModel");
const Plan = require("../models/plansModel");
const Transaction = require("../models/transactionModel");
const Notification = require("../models/notificationModel");

const notification = require("./../utils/notification");
const asyncErrorHandler = require("../utils/asyncErrorHandler");
const AppError = require('../utils/appError');

exports.register = asyncErrorHandler(async (req, res, next) => {

    const clientObj = {
        name: req.user.name,
        email: req.user.email,
        userIdCredentials: req.user._id,
        photoId: {
            data: new Buffer.from(req.body.photoId.data, 'base64'),
            contentType: req.body.photoId.contentType
        },
        profilePhoto: {
            data: new Buffer.from(req.body.profilePhoto.data, 'base64'),
            contentType: req.body.profilePhoto.contentType
        },
        address: req.body.address,
        age: req.body.age,
        phone:req.body.phone,
        gender: req.body.gender,
        jobRole: req.body.jobRole,
        qualification: req.body.qualification,
        agreement: req.body.agreement,
        question_0: req.body.question_0,
        question_1: req.body.question_1,
        question_2: req.body.question_2,
        question_3: req.body.question_3,
        question_4: req.body.question_4
    };

    const client = await Client.create({...clientObj});

    // Convert the buffer to a base64-encoded string
    const base64ImageData = client.photoId.data.toString('base64');

    res.status(201).json({
        status: 'success',
        client: {
                ...client.toObject(),
                photoId: {
                    ...client.photoId.toObject(),
                    data: base64ImageData
                }
            }
    });
})

exports.listOfAllAdvisors = asyncErrorHandler(async (req, res, next) => {
    const listOfNamesOfAdvisors = await Advisor.find();
    
    res.status(200).json({
        status: 'success',
        listOfNamesOfAdvisors
    });
});

exports.listOfPlans = asyncErrorHandler(async (req, res, next) => {
    const advisorId = req.params.advisorId;
    const client = await Client.findOne({ userIdCredentials: req.user._id });
    const currentDate = new Date();

    const plans = await Plan.find({ advisorId });
    // Create a new array of plans with the isSubscribed property included
    const plansWithSubscribedStatus = plans.map(async (plan) => {
        let isSubscribed = false;
        // Check if the plan is premium and if the client is subscribed
        if (plan.isPremium && plan.subscribedClientIds.length > 0) {
            const subscribedClient = plan.subscribedClientIds.find(clientData => clientData.clientId === client._id.toString());
            if (subscribedClient) {
                // Check if the subscription has not expired
                if (subscribedClient.subscriptionExpires > currentDate) {
                    isSubscribed = true;
                } else {
                    // If subscription has expired, remove the client from subscribedClientIds array
                    plan.subscribedClientIds = plan.subscribedClientIds.filter(clientData => clientData.clientId !== client._id.toString());
                    await plan.save(); // Save the plan to persist changes
                }
            }
        }
        return { ...plan.toObject(), isSubscribed }; // Include isSubscribed in the plan object
    });

    const resolvedPlans = await Promise.all(plansWithSubscribedStatus); // Wait for all plans to be resolved

    res.status(200).json({
        status: 'success',
        plans: resolvedPlans
    });
});
;


exports.buyASubscription = asyncErrorHandler(async (req, res, next) => {
    const planId = req.params.planId;
    const advisorId = req.params.advisorId;

    const plan = await Plan.findById(planId);
    const client = await Client.findOne({ userIdCredentials: req.user._id });
    const advisor = await Advisor.findById(advisorId);

    // Check if the client exists
    if (!client) {
        return next(new AppError('You need to first register yourself to make a profile!!!', 404));
    }

    // Check if the plan is premium
    if (!plan.isPremium) {
        return next(new AppError('This plan is not a premium plan!', 400));
    }

    // Check if the client is already subscribed to this plan
    const existingClientSubscription = client.subscribedPlanIds.find(subscription => subscription.planId === plan._id);
    if (existingClientSubscription && existingClientSubscription.subscriptionExpires > new Date()) {
        // Client is already subscribed to this plan and subscription is not expired
        return res.status(200).json({
            status: 'success',
            message: `${client.name} is already subscribed to this plan.`,
        });
    }

    // Check if the plan is already subscribed by this client
    const existingPlanSubscription = plan.subscribedClientIds.find(subscription => subscription.clientId === client._id);
    if (existingPlanSubscription && existingPlanSubscription.subscriptionExpires > new Date()) {
        // Plan is already subscribed by this client and subscription is not expired
        return res.status(200).json({
            status: 'success',
            message: `This plan is already subscribed by ${client.name}.`,
        });
    }

    // Update subscribedPlanIds for the client
    if (!client.subscribedPlanIds) {
        client.subscribedPlanIds = [];
    }

    const subscriptionExpires = new Date();
    subscriptionExpires.setDate(subscriptionExpires.getDate() + req.body.planDays); // Assuming days subscription

    if (existingClientSubscription) {
        // If subscription exists but expired, update subscription date and expiration
        existingClientSubscription.subscriptionDate = new Date();
        existingClientSubscription.subscriptionExpires = subscriptionExpires;
    } else {
        // If subscription doesn't exist, push a new subscription
        client.subscribedPlanIds.push({
            planId: plan._id,
            subscriptionDate: new Date(),
            subscriptionExpires: subscriptionExpires,
        });
    }

    await client.save();

    // Update subscribedClientIds for the plan
    if (!plan.subscribedClientIds) {
        plan.subscribedClientIds = [];
    }

    if (existingPlanSubscription) {
        // If subscription exists but expired, update subscription date and expiration
        existingPlanSubscription.subscriptionDate = new Date();
        existingPlanSubscription.subscriptionExpires = subscriptionExpires;
    } else {
        // If subscription doesn't exist, push a new subscription
        plan.subscribedClientIds.push({
            clientId: client._id,
            subscriptionDate: new Date(),
            subscriptionExpires: subscriptionExpires,
        });
    }

    await plan.save();

    notification.triggerNotification(`${client.name} bought your plan, ${plan.planName}`, client.userIdCredentials, advisor.userIdCredentials);
    
    res.status(201).json({
        status: 'success',
        message: `${client.name} bought a premium plan`,
    });
});


exports.investPlan = asyncErrorHandler(async (req, res, next) => {
    const planId = req.params.planId;
    const advisorId = req.params.advisorId;

    const plan = await Plan.findById(planId);
    const client = await Client.findOne({ userIdCredentials: req.user._id });
    const advisor = await Advisor.findById(advisorId);

    // Check if the client exists
    if (!client) {
        return next(new AppError('You need to first register yourself to make a profile!!!', 404));
    }

    // Update boughtPlanIds for the client
    if (!client.boughtPlanIds.includes(planId)) {
        client.boughtPlanIds.push(planId);
    }

    // Update boughtClientIds for the plan
    if (!plan.boughtClientIds.includes(client._id)) {
        plan.boughtClientIds.push(client._id);
    }

    await Promise.all([client.save(), plan.save()]);

    // Update clientIds for the advisor
    if (!advisor.clientIds.includes(client._id)) {
        advisor.clientIds.push(client._id);
        await advisor.save();
    }

    // Update advisorIds for the client
    if (!client.advisorIds.includes(advisor._id)) {
        client.advisorIds.push(advisor._id);
        await client.save();
    }

    const investedAmt = req.body.price * req.body.qty;

    // creating a transaction
    const transaction = await Transaction.create({
        planId,
        planName: plan.planName,
        isPremium: plan.isPremium,
        advisorId,
        clientId : client._id,
        clientName: client.name,
        investedAmount: investedAmt
    });

    // Find the index of the plan in client.planData array
    const planIndex = client.planData.findIndex(data => data.planId === plan.planId);

    if (planIndex !== -1) {
        // If the plan exists, update its details
        const existingData = client.planData[planIndex];
        const newQty = req.body.qty + existingData.qty;
        const newAvgPrice = ((req.body.price * req.body.qty) + (existingData.avgPrice * existingData.qty)) / newQty;

        // Update planData
        client.planData[planIndex].qty = newQty;
        client.planData[planIndex].avgPrice = newAvgPrice;
    } else {
        // If the plan doesn't exist, create a new document
        const newDocument = {
            planId: plan.planId,
            planName: plan.planName,
            avgPrice: req.body.price,
            qty: req.body.qty
        };

        // Add the new document to planData
        client.planData.push(newDocument);
    }

    await client.save();


    notification.triggerNotification(`${client.name} bought your plan, ${plan.planName}`, client.userIdCredentials, advisor.userIdCredentials);
    
    res.status(201).json({
        status: 'success',
        message: `${client.name} bought a plan ${transaction.planName}`,
        transaction
    });
});

exports.investedPlans = asyncErrorHandler(async (req, res, next) => {
    const client = await Client.findOne({ userIdCredentials: req.user._id });

    const plans = await Plan.find({ _id: { $in: client.boughtPlanIds } });

    res.status(200).json({
        status: "success",
        plans
    });
})

exports.listOfAdvisors = asyncErrorHandler(async (req, res, next) => {
    const client = await Client.findOne({ userIdCredentials: req.user._id });

    const advisorObjectIds = client.advisorIds.map(id => new mongoose.Types.ObjectId(id));

    const advisors = await Advisor.find({ _id: { $in: advisorObjectIds } });

    res.status(200).json({
        status: 'success',
        advisors
    });
})

exports.listOfSubscribedPlans = asyncErrorHandler(async (req, res, next) => {
    // const client = await Client.findOne({ userIdCredentials: req.user._id });

    // const transactions = await Transaction.find({ clientId: client._id });

    // const AdvisorIds = transactions.map(transaction => {
    //     return transaction.advisorId
    // });

    // const advisorNames = await Promise.all(AdvisorIds.map(async (id) => {
    //     const advisor = await Advisor.findById(id).  select('name');
    //     return advisor.name; // Return the name of the advisor
    // }));

    // res.status(200).json({
    //     status: 'success',
    //     transactions,
    //     advisorNames
    // });

    const client = await Client.findOne({ userIdCredentials: req.user._id });
    const currentDate = new Date();

    // Get the list of subscribed planIds for the current client
    const subscribedPlanIds = client.subscribedPlanIds.map(subscribedPlan => subscribedPlan.planId);

    // Find all plans that the client is subscribed to
    const plans = await Plan.find({ _id: { $in: subscribedPlanIds } }).select('-photo');

    // Array to store plans that need to be saved
    const plansToUpdate = [];

    // Remove expired subscriptions
    plans.forEach(plan => {
        plan.subscribedClientIds = plan.subscribedClientIds.filter(subscribedClient => {
            // Check if the subscription has expired
            if (subscribedClient.subscriptionExpires <= currentDate) {
                return false; // Remove client from the subscribedClientIds array
            }
            return true; // Keep client in the subscribedClientIds array
        });

        // If there are no clients subscribed to this plan anymore, remove the plan from the client's subscribedPlanIds array
        if (plan.subscribedClientIds.length === 0) {
            client.subscribedPlanIds = client.subscribedPlanIds.filter(subscribedPlan => subscribedPlan.planId !== plan._id.toString());
        }

        // Add the plan to plansToUpdate array for later saving
        plansToUpdate.push(plan);
    });

    // Save all plans that need to be updated
    await Promise.all(plansToUpdate.map(plan => plan.save()));

    // Save the client with updated subscribedPlanIds
    await client.save();

    res.status(200).json({
        status: 'success',
        plans
    });
})

exports.listOfSubscribedPlansDetails = asyncErrorHandler( async(req, res, next) => {
    const client = await Client.findOne({ userIdCredentials: req.user._id });

    const transactions = await Transaction.find({ clientId: client._id });

    let totalCumulativeProfit = 0;
    let profits = [];

    transactions.forEach(transaction => {
        let totalProfit = 0; // Initialize total profit for each transaction separately

        transaction.planStats.forEach(stat => {
            // Generate a random value between -0.03 and 0.05
            const randomMultiplier = Math.random() * (0.05 + 0.03) - 0.03;
            const profitForStat = stat.contriAmount * randomMultiplier;
            console.log(`${stat.contriAmount} : `, randomMultiplier, "Profit: ", profitForStat);

            totalProfit += profitForStat; // Calculate profit for each stat
        });

        console.log("*********************************")
        const cumulativeProfit = transaction.investedAmount + totalProfit;
        console.log("Profit from this plan: ", totalProfit)
        console.log("Initial Invested Amount in this plan: ", transaction.investedAmount)
        console.log("Return from this plan: ", cumulativeProfit)
        console.log();
        console.log("&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&");
        console.log()
        totalCumulativeProfit += cumulativeProfit;
        profitElement = {
            planId: transaction.planId,
            profit: totalProfit
        }
        profits.push(profitElement);
    });

    res.status(200).json({
        status: 'success',
        profits
    });
})

exports.browseAllPlans = asyncErrorHandler(async (req, res, next) => {
    const plans = await Plan.find();
    const advisors = await Advisor.find();

    const client = await Client.findOne({ userIdCredentials: req.user._id });
    const currentDate = new Date();
    // Create a new array of plans with the isSubscribed property included
    const plansWithSubscribedStatus = plans.map(async (plan) => {
        let isSubscribed = false;
        // Check if the plan is premium and if the client is subscribed
        if (plan.isPremium && plan.subscribedClientIds.length > 0) {
            const subscribedClient = plan.subscribedClientIds.find(clientData => clientData.clientId === client._id.toString());
            if (subscribedClient) {
                // Check if the subscription has not expired
                if (subscribedClient.subscriptionExpires > currentDate) {
                    isSubscribed = true;
                } else {
                    // If subscription has expired, remove the client from subscribedClientIds array
                    plan.subscribedClientIds = plan.subscribedClientIds.filter(clientData => clientData.clientId !== client._id.toString());
                    await plan.save(); // Save the plan to persist changes
                }
            }
        }

        // Find the advisor for this plan
        const advisor = advisors.find((adv) => adv._id.toString() === plan.advisorId.toString());
        const advisorName = advisor ? advisor.name : 'Unknown';
        
        

        return { ...plan.toObject(), isSubscribed, advisorName }; // Include isSubscribed and advisorName in the plan object
    });

    const resolvedPlans = await Promise.all(plansWithSubscribedStatus); // Wait for all plans to be resolved

    res.status(200).json({
        status: 'success',
        plans: resolvedPlans
    });
});


exports.getAdvisor = asyncErrorHandler(async (req, res, next) => {
    const advisorId = req.params.advisorId;

    const advisor = await Advisor.findById(advisorId);

    res.status(200).json({
        status: 'success',
        advisor
    });
})

exports.getOwnDetails = asyncErrorHandler(async (req, res, next) => {
    const client = await Client.findOne({ userIdCredentials: req.user._id });

    res.status(200).json({
        status: 'success',
        client
    });
})

exports.editProfile = asyncErrorHandler(async (req, res, next) => {
    const clientObj = {...req.body};
    const client = await Client.findOne({ userIdCredentials: req.user._id });
 
    const updatedClient = await Client.findByIdAndUpdate(client._id, clientObj, {new: true });
 
    res.status(200).json({
        status: 'success',
        updatedClient
    });
})

exports.getAllNotification = asyncErrorHandler(async (req, res, next) => {
    const client = await Client.findOne({userIdCredentials:req.user._id})
    const notifications = await Notification.find({ recipient: client._id });

    res.status(200).json({
        status: 'success',
        notifications
    });
})

exports.allTransactions = asyncErrorHandler(async (req, res, next) => {
    const client = await Client.findOne({ userIdCredentials: req.user._id });

    const transactions = await Transaction.find({ clientId: client._id });

    const AdvisorIds = transactions.map(transaction => {
        return transaction.advisorId
    });

    const advisorNames = await Promise.all(AdvisorIds.map(async (id) => {
        const advisor = await Advisor.findById(id).  select('name');
        return advisor.name; // Return the name of the advisor
    }));

    res.status(200).json({
        status: 'success',
        transactions,
        advisorNames
    });
});