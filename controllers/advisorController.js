const mongoose = require("mongoose");

const Advisor = require("./../models/advisorModel");
const Client = require("./../models/clientModel");
const Plan = require('./../models/plansModel');
const Transaction = require("./../models/transactionModel");
const Stock = require('./../models/stocksModel');
const Notification = require('./../models/notificationModel');

const asyncErrorHandler = require('./../utils/asyncErrorHandler');
const { triggerMultipleNotification } = require("../utils/notification");
const { getPlanDescription } = require("../utils/getPlanDescrpGenAI");
const AppError = require("../utils/appError");

// Edit
// 1. Existing Stock qty === 0, it should be deleted
// 2. Existing Stock qty decreased than previous
// 3. Existing Stock qty increased than previous



exports.register = asyncErrorHandler(async (req, res, next) => {

    const advisorObj = {...req.body};
    advisorObj.userIdCredentials = req.user._id;
    advisorObj.email = req.user.email;
    advisorObj.name = req.user.name;
    
    const advisor = await Advisor.create({...advisorObj});

    res.status(201).json({
        status: 'success',
        data: {
            advisor
        }
    });
});

exports.getGenAIPlan = asyncErrorHandler(async (req, res, next) => {
    const stocks = req.body.stocks;

    const planAdvise = await getPlanDescription(stocks);

    res.status(200).json({
        status: "success",
        planAdvise
    });
})

exports.addPlan = asyncErrorHandler(async (req, res, next) => {

    const planObj = {...req.body};
    const advisorId = await Advisor.findOne({userIdCredentials: req.user._id});
    planObj.advisorId = advisorId._id;
    planObj.stocks

    planObj.photo = {
        data: new Buffer.from(req.body.photo.data, 'base64'),
        contentType: req.body.photo.contentType
    };

    const plan = await Plan.create({...planObj});
    
    res.status(201).json({
        status: 'success',
        plan
    })
    // res.redirect('/api/v1/check-auth/welcome-advisor');
});

exports.listOfPlans = asyncErrorHandler(async (req, res, next) => {
    const advisor = await Advisor.findOne({ userIdCredentials: req.user._id });
    const plans = await Plan.find({ advisorId: advisor._id });

    // const plansWithRandomValues = plans.map(plan => {
    //     const planWithRandomValues = plan.toObject(); // Convert Mongoose document to plain JavaScript object
    //     planWithRandomValues.stocks = plan.stocks.map(stock => {
    //         const randomMultiplier = (Math.random() * (0.05 + 0.03) - 0.03) * 100;
    //         const currentDayValue = randomMultiplier.toFixed(2); // Limiting to 2 decimal places
    //         return {
    //             ...stock.toObject(), // Convert Mongoose document to plain JavaScript object
    //             currentDayValue
    //         };
    //     });
    //     return planWithRandomValues;
    // });

    res.status(200).json({
        status: 'success',
        plans
    });
    // plansWithRandomValues
});


exports.topPlans = asyncErrorHandler(async (req, res, next) => {
    const advisor = await Advisor.findOne({ userIdCredentials: req.user._id });
    const plans = await Plan.aggregate([
        { $match: { advisorId: advisor._id, boughtClientIds: { $ne: [] } } },
        { $sort: { 'boughtClientIds.length': -1 } },
        { $limit: 6 }
      ]);
    res.status(200).json({
        status: 'success',
        plans
    });
});

exports.listOfClients = asyncErrorHandler(async(req, res, next) => {
    const advisor = await Advisor.findOne({ userIdCredentials: req.user._id });

    const clientObjectIds = advisor.clientIds.map(id => new mongoose.Types.ObjectId(id));

    const clients = await Client.find({ _id: { $in: clientObjectIds }});

    res.status(200).json({
        status: 'success',
        clients
    });
});

exports.getOwndetails = asyncErrorHandler(async (req, res, next) => {
    const advisor = await Advisor.findOne({userIdCredentials: req.user._id}).select('name');

    if (!advisor) {
        return res.status(404).json({
            status: "failed",
            message: "Advisor not found"
        });
    }

    res.status(200).json({
        status: 'success',
        advisor
    });
}) 

exports.getTransactions = asyncErrorHandler(async (req, res, next) => {
    const advisor = await Advisor.findOne({ userIdCredentials: req.user._id });

    const transactions = await Transaction.find({ advisorId: advisor._id }).sort({ 'date': -1, 'investedAmount': -1 });

    res.status(200).json({
        status: 'success',
        transactions
    });
})

exports.getNoOfClients = asyncErrorHandler(async (req, res, next) => {

    const advisor = await Advisor.findOne({ userIdCredentials: req.user._id });

    res.status(200).json({
        status: 'success',
        noOfClients: advisor.clientIds.length
    });
})

exports.totalCummulativeInvestedAmounts = asyncErrorHandler(async (req, res, next) => {
    const advisor = await Advisor.findOne({ userIdCredentials: req.user._id });

    const transactions = await Transaction.find({ advisorId: advisor._id });

    const totalInvestedAmount = transactions.reduce((total, trsc) => total + trsc.investedAmount, 0);

    res.status(200).json({
        status: 'success',
        totalInvestedAmount
    });
})

// 1. cummalative return for all transactions (Profit means +ve/-ve)
//  --- First need to find the profit of each plan (Profit means +ve/-ve)
//  -----  First need to find the profit of each stock in a plan (Profit means +ve/-ve)

exports.cummulativeCurrentProfit = asyncErrorHandler(async (req, res, next) => {
    const advisor = await Advisor.findOne({ userIdCredentials: req.user._id });

    const transactions = await Transaction.find({ advisorId: advisor._id });

    let totalCumulativeProfit = 0;
    let totalInvestedAmount = 0;

    transactions.forEach(transaction => {
        let totalProfit = 0; // Initialize total profit for each transaction separately
        totalInvestedAmount += transaction.investedAmount;
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
    });

    res.status(200).json({
        status: 'success',
        totalInvestedAmount,
        totalCumulativeReturn: totalCumulativeProfit,
        totalCumulativeProfit: totalCumulativeProfit - totalInvestedAmount
    });
});

// exports.deletePlan = asyncErrorHandler(async (req, res, next) => {
//     const planId = req.params.planId;
//     const plan = await Plan.findByIdAndUpdate(planId, {
//         isActive : false
//     }, { new: true });

//     res.status(200).json({
//         status: 'success',
//         message: "Plan Deleted !!! :) ",
//         plan
//     });
// })

exports.deletePlan = asyncErrorHandler(async(req, res, next) => {    
const planId = req.params.planId;    
const plan = await Plan.findById(planId);         
// Toggle isActive value
    plan.isActive = !plan.isActive;    
    await plan.save();     
    res.status(200).json({status:'success', message: plan.isActive ?"Plan Activated !!! :)": "Plan Deactivated !!! :(",plan}); 
})

exports.getAllStocks = asyncErrorHandler(async (req, res, next) => {
    const date = req.body.date || "2022-03-07";

    console.log(date);

    const stocks = await Stock.aggregate([
        {
            $project: {
                symbol: 1,
                historical: {
                    $filter: {
                        input: "$historical",
                        as: "history",
                        cond: { $eq: ["$$history.date", date] }
                    }
                }
            }
        }
    ]);

    res.status(200).json({
        status: 'success',
        stocks
    })
})

function calculateNewAvgPrice(stocks, updatedStocks) {
    const newStocks = [];
    const processedSymbols = {};
    
    for (const updatedStock of updatedStocks) {
        const { symbol, qty, price: avgPrice } = updatedStock;
        
        if (processedSymbols[symbol]) {
            continue;
        }
        
        processedSymbols[symbol] = true;
        
        let foundStock = false;
        for (const stock of stocks) {
            if (stock.symbol === symbol) {
                foundStock = true;
                const { qty: oldQty, price: oldAvgPrice } = stock;
                
                if (qty > oldQty) {
                    const newQty = qty;
                    const newAvgPrice = ((oldQty * oldAvgPrice) + ((qty - oldQty) * avgPrice)) / newQty;
                    
                    newStocks.push({
                        symbol,
                        qty: newQty,
                        price: newAvgPrice
                    });
                } else {
                    newStocks.push({
                        symbol,
                        qty,
                        price: oldAvgPrice
                    });
                }
            }
        }
        
        if (!foundStock) {
            newStocks.push({
                symbol,
                qty,
                price: avgPrice
            });
        }
    }

    return newStocks;
}

exports.editPlan = asyncErrorHandler(async (req, res, next) => {
    const planObj = { ...req.body };
    const planId = req.params.planId;

    const plan = await Plan.findById(planId);
    planObj.stocks = calculateNewAvgPrice(plan.stocks, planObj.stocks);

    const updatedPlan = await Plan.findByIdAndUpdate(planId, planObj, { new: true });

    if (plan.isPremium === true) {
        const currentDate = new Date();
        const activeClientIds = plan.subscribedClientIds
            .filter(obj => obj.subscriptionExpires > currentDate)
            .map(obj => obj.clientId);

            // Trigger notification to all clients who have an active subscription
        await triggerMultipleNotification(`Hey *, some changes had been made ${plan.planName}`, plan.advisorId, activeClientIds);
    } else {
        // Exclude client IDs from boughtClientIds that are already in activeClientIds
        // const boughtClientIds = plan.boughtClientIds.filter(clientId => {
        //     return !plan.subscribedClientIds.some(subscribedClient => subscribedClient.clientId === clientId);
        // });

        // Trigger notification to clients who have invested in the plan but are not subscribed
        await triggerMultipleNotification(`Hey *, some changes had been made ${plan.planName}`, plan.advisorId, plan.boughtClientIds);
    }

    res.status(200).json({
        status: 'success',
        updatedPlan
    });
});



exports.getPlan = asyncErrorHandler(async (req, res, next) => {
    const planId = req.params.planId;

    const plan = await Plan.findById(planId);

    res.status(200).json({
        status: 'success',
        plan
    });
})

exports.getAllNotification = asyncErrorHandler(async (req, res, next) => {
    const notifications = await Notification.find({ recipient: req.user._id });

    res.status(200).json({
        status: 'success',
        notifications
    });
});

exports.ratioOfPlansSold = asyncErrorHandler(async (req, res, next) => {
    const advisor = await Advisor.findOne({ userIdCredentials: req.user._id });

    const transactions = await Transaction.find({ advisorId: advisor._id });

    let countFreePlansSold = 0;
    let countPremiumPlansSold = 0;

    transactions.map((transaction) => {
        if(transaction.isPremium === false){
            countFreePlansSold++;
        } else {
            countPremiumPlansSold++
        }
    });

    res.status(200).json({
        status: "success",
        FreeSoldCount: countFreePlansSold,
        PremiumSoldCount: countPremiumPlansSold
    });
});

exports.ratioOfToatalInvestedAmt = asyncErrorHandler(async (req, res, next) => {
    const advisor = await Advisor.findOne({ userIdCredentials: req.user._id });

    const transactions = await Transaction.find({ advisorId: advisor._id });

    let totalInvestedAmtFreePlans = 0;
    let totalInvestedAmtPremiumPlans = 0;

    transactions.map((transaction) => {
        if(transaction.isPremium === false){
            totalInvestedAmtFreePlans += transaction.investedAmount;
        } else {
            totalInvestedAmtPremiumPlans += transaction.investedAmount;
        }
    });

    res.status(200).json({
        status: "success",
        freePlans: totalInvestedAmtFreePlans,
        premiumPlans: totalInvestedAmtPremiumPlans
    });
})

exports.noOfSoldPlansMonthWiseFreeVsPrem = asyncErrorHandler(async (req, res, next) => {
    // Find the advisor by user credentials
    const advisor = await Advisor.findOne({ userIdCredentials: req.user._id }).sort({ date: -1, investedAmount: -1 });

    // If no advisor found, return an error
    if (!advisor) {
        return next(new AppError('Advisor not found', 404));
    }

    // Aggregate transactions to get the month-wise count of free and premium plans
    const transactions = await Transaction.aggregate([
        // Match transactions for the specific advisor
        { $match: { advisorId: advisor._id } },
        // Group by year and month, and separate free and premium plans
        {
            $group: {
                _id: {
                    year: { $year: "$date" },
                    month: { $month: "$date" },
                    isPremium: "$isPremium"
                },
                count: { $sum: 1 }
            }
        },
        // Sort by year and month in descending order
        { $sort: { "_id.year": -1, "_id.month": -1 } },
        // Group again to restructure the output
        {
            $group: {
                _id: { year: "$_id.year", month: "$_id.month" },
                plans: {
                    $push: {
                        isPremium: "$_id.isPremium",
                        count: "$count"
                    }
                }
            }
        },
        // Project to format the output
        {
            $project: {
                _id: 0,
                year: "$_id.year",
                month: "$_id.month",
                plans: {
                    $arrayToObject: {
                        $map: {
                            input: "$plans",
                            as: "plan",
                            in: {
                                k: { $cond: { if: "$$plan.isPremium", then: "premium", else: "free" } },
                                v: "$$plan.count"
                            }
                        }
                    }
                }
            }
        }
    ]);

    res.status(200).json({
        ststus: "success",
        transactions
    });
});

exports.topInvestors = asyncErrorHandler(async (req, res, next) => {
    // Step 1: Find the advisor by user ID
    const advisor = await Advisor.findOne({ userIdCredentials: req.user._id });
    if (!advisor) {
        return res.status(404).json({ message: 'Advisor not found' });
    }

    // Step 2: Aggregate transactions to find top investors
    const pipeline = [
        {
            $match: { advisorId: advisor._id }  // Filter transactions by advisorId
        },
        {
            $group: {
                _id: { clientId: "$clientId", planId: "$planId" }, // Group by clientId and planId to get unique plans per client
            }
        },
        {
            $group: {
                _id: "$_id.clientId",   // Group by clientId to count the unique plans per client
                uniquePlansCount: { $sum: 1 }
            }
        },
        {
            $sort: { uniquePlansCount: -1 }  // Sort by the count of unique plans in descending order
        },
        {
            $lookup: {
                from: "clients", // Assuming the clients collection is named "clients"
                localField: "_id",
                foreignField: "_id",
                as: "clientInfo"
            }
        },
        {
            $unwind: "$clientInfo" // Unwind the client info to include it in the result
        },
        {
            $project: {
                _id: 0,
                clientId: "$_id",
                clientName: "$clientInfo.name",
                uniquePlansCount: 1
            }
        }
    ];

    const topInvestors = await Transaction.aggregate(pipeline);

    res.status(200).json({ 
        topInvestors 
    });
});

exports.topInvestorsInvestedAmt = asyncErrorHandler(async (req, res, next) => {
    // Step 1: Find the advisor by user ID
    const advisor = await Advisor.findOne({ userIdCredentials: req.user._id });
    if (!advisor) {
        return res.status(404).json({ message: 'Advisor not found' });
    }

    // Step 2: Aggregate transactions to find top investors
    const pipeline = [
        {
            $match: { advisorId: advisor._id }  // Filter transactions by advisorId
        },
        {
            $group: {
                _id: "$clientId",   // Group by clientId to count the total invested amount per client
                uniquePlansCount: { $addToSet: "$planId" }, // Use $addToSet to get unique plan count
                totalAmountInvested: { $sum: "$investedAmount" } // Sum the invested amounts for each client
            }
        },
        {
            $addFields: {
                uniquePlansCount: { $size: "$uniquePlansCount" } // Convert uniquePlansCount from set to size
            }
        },
        {
            $sort: { uniquePlansCount: -1 }  // Sort by the count of unique plans in descending order
        },
        {
            $lookup: {
                from: "clients", // Assuming the clients collection is named "clients"
                localField: "_id",
                foreignField: "_id",
                as: "clientInfo"
            }
        },
        {
            $unwind: "$clientInfo" // Unwind the client info to include it in the result
        },
        {
            $project: {
                _id: 0,
                clientId: "$_id",
                clientName: "$clientInfo.name",
                uniquePlansCount: 1,
                totalAmountInvested: 1
            }
        }
    ];

    const topInvestors = await Transaction.aggregate(pipeline);

    res.status(200).json({
        status: "success", 
        topInvestors 
    });
});